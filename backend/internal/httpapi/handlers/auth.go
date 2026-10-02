package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	mw "github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

const (
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 30 * 24 * time.Hour
	graceWindow     = 30 * time.Second
	familyRateLimit = 10
)

type Auth struct {
	pool      *pgxpool.Pool
	keyPair   *auth.KeyPair
	ipLimiter *auth.InMemoryRateLimiter
	logger    *slog.Logger
}

func NewAuth(pool *pgxpool.Pool, kp *auth.KeyPair, logger *slog.Logger) *Auth {
	return &Auth{
		pool:      pool,
		keyPair:   kp,
		ipLimiter: auth.NewInMemoryRateLimiter(5, time.Minute),
		logger:    logger,
	}
}

// GenerateCSRFToken creates a cryptographically secure random token for CSRF protection.
func GenerateCSRFToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type loginRequest struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	RememberMe bool   `json:"remember_me"`
}

// Login verifies credentials and starts a refresh family.
func (h *Auth) Login(w http.ResponseWriter, r *http.Request) {
	clientIP := clientIP(r)
	if !h.ipLimiter.Allow(clientIP) {
		httperr.Write(w, httperr.New("RATE_LIMITED", http.StatusTooManyRequests, "Too many login attempts"))
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusBadRequest, "Invalid request body"))
		return
	}
	if req.Email == "" || req.Password == "" {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Email or password is incorrect"))
		return
	}

	var userID, tenantID, hash, fullName string
	var permVersion int
	err := h.pool.QueryRow(r.Context(),
		"SELECT id, tenant_id, password_hash, full_name, perm_version FROM users WHERE email = $1 AND status = 'active'",
		req.Email,
	).Scan(&userID, &tenantID, &hash, &fullName, &permVersion)
	if errors.Is(err, pgx.ErrNoRows) {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Email or password is incorrect"))
		return
	}
	if err != nil {
		h.logger.Error("login: database error", "error", err)
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
		return
	}

	ok, err := auth.VerifyPassword(req.Password, hash)
	if err != nil {
		h.logger.Error("login: password verify error", "error", err)
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
		return
	}
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Email or password is incorrect"))
		return
	}

	fpg := hashFingerprint(r.UserAgent(), clientIP)
	familyID, plainRefresh, err := h.createRefreshFamily(r.Context(), userID, tenantID, fpg, req.RememberMe)
	if err != nil {
		h.logger.Error("login: create refresh family error", "error", err)
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
		return
	}

	accessToken, jti, err := auth.SignAccessToken(h.keyPair, userID, tenantID, permVersion, fpg)
	if err != nil {
		h.logger.Error("login: sign access token error", "error", err)
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
		return
	}

	csrfToken, _ := GenerateCSRFToken()
	h.setSessionCookies(w, accessToken, plainRefresh, csrfToken, req.RememberMe)
	h.logger.Info("login successful", "user_id", userID, "tenant_id", tenantID, "remember", req.RememberMe)

	writeJSON(w, http.StatusOK, map[string]any{
		"user_id":      userID,
		"tenant_id":    tenantID,
		"perm_version": permVersion,
		"jti":          jti,
		"family_id":    familyID,
	})
}

type refreshRow struct {
	TokenID     string
	FamilyID    string
	Status      string
	RotatedAt   *time.Time
	ExpiresAt   time.Time
	Fingerprint string
	Remember    bool
	UserID      string
	TenantID    string
	PermVersion int
}

// Refresh rotates the refresh token with grace-sibling semantics.
func (h *Auth) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil || cookie.Value == "" {
		httperr.Write(w, httperr.New("AUTH_REFRESH_INVALID", http.StatusUnauthorized, "Missing refresh token"))
		return
	}

	clientIP := clientIP(r)
	fp := hashFingerprint(r.UserAgent(), clientIP)
	requestID := chimw.GetReqID(r.Context())

	outcome := h.rotateRefresh(r.Context(), cookie.Value, fp, requestID)
	if outcome.Code != "" {
		httperr.Write(w, httperr.New(outcome.Code, outcome.Status, "Refresh failed"))
		return
	}

	accessToken, jti, err := auth.SignAccessToken(h.keyPair, outcome.Row.UserID, outcome.Row.TenantID, outcome.Row.PermVersion, outcome.Row.Fingerprint)
	if err != nil {
		h.logger.Error("refresh: sign access token error", "error", err)
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
		return
	}

	csrfToken, _ := GenerateCSRFToken()
	h.setSessionCookies(w, accessToken, outcome.PlainToken, csrfToken, outcome.Row.Remember)

	writeJSON(w, http.StatusOK, map[string]any{
		"user_id":      outcome.Row.UserID,
		"tenant_id":    outcome.Row.TenantID,
		"perm_version": outcome.Row.PermVersion,
		"jti":          jti,
	})
}

type refreshOutcome struct {
	PlainToken string
	Row        refreshRow
	Code       string
	Status     int
}

func (h *Auth) rotateRefresh(ctx context.Context, tokenValue, fp, requestID string) refreshOutcome {
	tokenHash := sha256.Sum256([]byte(tokenValue))

	var row refreshRow
	var outcome refreshOutcome

	err := pg.WithTx(ctx, h.pool, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `
			SELECT t.id, t.family_id, t.status, t.rotated_at, t.expires_at,
			       f.fingerprint, f.remember, f.user_id, f.tenant_id, u.perm_version
			FROM refresh_tokens t
			JOIN refresh_families f ON f.id = t.family_id
			JOIN users u ON u.id = f.user_id
			WHERE t.token_hash = $1`, hex.EncodeToString(tokenHash[:])).
			Scan(&row.TokenID, &row.FamilyID, &row.Status, &row.RotatedAt, &row.ExpiresAt,
				&row.Fingerprint, &row.Remember, &row.UserID, &row.TenantID, &row.PermVersion)
		if err != nil {
			outcome.Code, outcome.Status = "AUTH_REFRESH_INVALID", http.StatusUnauthorized
			return nil
		}

		if fp != row.Fingerprint {
			revokeFamily(ctx, tx, row.FamilyID)
			insertAudit(ctx, tx, row.TenantID, row.UserID, "AUTH_FINGERPRINT_CHANGED", row.FamilyID, requestID)
			outcome.Code, outcome.Status = "AUTH_SESSION_CHANGED", http.StatusUnauthorized
			return nil
		}

		now := time.Now()
		kind := "rotation"
		parentID := row.TokenID

		switch {
		case row.Status == "active" && row.ExpiresAt.After(now):
			var rotatedID string
			err := tx.QueryRow(ctx, `
				UPDATE refresh_tokens SET status='rotated', rotated_at=now()
				WHERE id = $1 AND status='active' RETURNING id`, row.TokenID).Scan(&rotatedID)
			if err != nil {
				outcome.Code, outcome.Status = "AUTH_REFRESH_INVALID", http.StatusUnauthorized
				return nil
			}
		case row.Status == "rotated" && row.RotatedAt != nil && now.Sub(*row.RotatedAt) <= graceWindow:
			var rotations int
			if err := tx.QueryRow(ctx, `
				SELECT count(*) FROM refresh_tokens
				WHERE family_id = $1 AND created_at > now() - interval '1 minute'`, row.FamilyID).Scan(&rotations); err != nil {
				return err
			}
			if rotations >= familyRateLimit {
				outcome.Code, outcome.Status = "AUTH_REFRESH_INVALID", http.StatusUnauthorized
				return nil
			}
			kind = "grace_sibling"
			insertAudit(ctx, tx, row.TenantID, row.UserID, "AUTH_REFRESH_GRACE_SIBLING", row.FamilyID, requestID)
		default:
			revokeFamily(ctx, tx, row.FamilyID)
			insertAudit(ctx, tx, row.TenantID, row.UserID, "AUTH_REFRESH_REUSE_DETECTED", row.FamilyID, requestID)
			outcome.Code, outcome.Status = "AUTH_REFRESH_INVALID", http.StatusUnauthorized
			return nil
		}

		plain, hash, err := newOpaqueToken()
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO refresh_tokens (family_id, token_hash, parent_id, rotation_kind, expires_at)
			VALUES ($1, $2, $3, $4, now() + interval '30 days')`,
			row.FamilyID, hash, parentID, kind)
		if err != nil {
			return fmt.Errorf("insert refresh child: %w", err)
		}

		outcome.PlainToken = plain
		outcome.Row = row
		return nil
	})
	if err != nil {
		h.logger.Error("refresh: transaction error", "error", err)
		return refreshOutcome{Code: "INTERNAL", Status: http.StatusInternalServerError}
	}
	return outcome
}

// Logout revokes the refresh family and clears all session cookies.
func (h *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("refresh_token"); err == nil && cookie.Value != "" {
		sum := sha256.Sum256([]byte(cookie.Value))
		var familyID, tenantID, userID string
		err := h.pool.QueryRow(r.Context(), `
			SELECT t.family_id, f.tenant_id, f.user_id
			FROM refresh_tokens t
			JOIN refresh_families f ON f.id = t.family_id
			WHERE t.token_hash = $1`, hex.EncodeToString(sum[:])).
			Scan(&familyID, &tenantID, &userID)
		if err == nil {
			revokeFamily(r.Context(), h.pool, familyID)
			insertAudit(r.Context(), h.pool, tenantID, userID, "AUTH_LOGOUT", familyID, chimw.GetReqID(r.Context()))
		}
	}

	http.SetCookie(w, &http.Cookie{Name: "access_token", Value: "", MaxAge: -1, Path: "/"})
	http.SetCookie(w, &http.Cookie{Name: "refresh_token", Value: "", MaxAge: -1, Path: "/api/v1/auth/refresh"})
	http.SetCookie(w, &http.Cookie{Name: "csrf", Value: "", MaxAge: -1, Path: "/"})
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

// Me handles GET /api/v1/auth/me.
func (h *Auth) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := r.Context().Value(mw.ClaimsKey).(*auth.Claims)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user_id":   claims.Subject,
		"tenant_id": claims.TenantID,
		"fpg":       claims.Fingerprint,
	})
}

func (h *Auth) createRefreshFamily(ctx context.Context, userID, tenantID, fpg string, remember bool) (string, string, error) {
	familyID := generateUUID()
	plain, hash, err := newOpaqueToken()
	if err != nil {
		return "", "", err
	}
	err = pg.WithTx(ctx, h.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO refresh_families (id, tenant_id, user_id, fingerprint, remember)
			VALUES ($1, $2, $3, $4, $5)`, familyID, tenantID, userID, fpg, remember)
		if err != nil {
			return fmt.Errorf("insert refresh family: %w", err)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO refresh_tokens (family_id, token_hash, rotation_kind, expires_at)
			VALUES ($1, $2, 'root', now() + interval '30 days')`, familyID, hash)
		if err != nil {
			return fmt.Errorf("insert refresh token: %w", err)
		}
		return nil
	})
	if err != nil {
		return "", "", err
	}
	return familyID, plain, nil
}

func (h *Auth) setSessionCookies(w http.ResponseWriter, access, refresh, csrf string, remember bool) {
	refreshMaxAge := -1
	if remember {
		refreshMaxAge = int(refreshTokenTTL.Seconds())
	}
	http.SetCookie(w, &http.Cookie{Name: "access_token", Value: access, Path: "/", HttpOnly: true, Secure: false, SameSite: http.SameSiteLaxMode, MaxAge: int(accessTokenTTL.Seconds())})
	http.SetCookie(w, &http.Cookie{Name: "refresh_token", Value: refresh, Path: "/api/v1/auth/refresh", HttpOnly: true, Secure: false, SameSite: http.SameSiteStrictMode, MaxAge: refreshMaxAge})
	http.SetCookie(w, &http.Cookie{Name: "csrf", Value: csrf, Path: "/", HttpOnly: false, Secure: false, SameSite: http.SameSiteLaxMode, MaxAge: int(accessTokenTTL.Seconds())})
}

// auditExec abstracts pgx.Tx and *pgxpool.Pool for audit and revocation operations.
type auditExec interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

func revokeFamily(ctx context.Context, ex auditExec, familyID string) {
	_, _ = ex.Exec(ctx, `UPDATE refresh_tokens SET status='revoked' WHERE family_id=$1 AND status<>'revoked'`, familyID)
	_, _ = ex.Exec(ctx, `UPDATE refresh_families SET revoked_at=now() WHERE id=$1`, familyID)
}

func insertAudit(ctx context.Context, ex auditExec, tenantID, userID, action, entityID, requestID string) {
	_, _ = ex.Exec(ctx, `
		INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id, request_id)
		VALUES ($1, $2, $3, 'refresh_family', $4, $5)`,
		tenantID, userID, action, entityID, requestID)
}

func newOpaqueToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	plain := base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(plain))
	return plain, hex.EncodeToString(sum[:]), nil
}

func clientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func hashFingerprint(ua, ip string) string {
	uaHash := sha256.Sum256([]byte(ua))
	ipHash := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(uaHash[:]) + ":" + hex.EncodeToString(ipHash[:])
}

func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

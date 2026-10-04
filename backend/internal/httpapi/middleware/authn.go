package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
)

type claimsKeyType string

const ClaimsKey claimsKeyType = "stockkit.claims"

// AuthN authenticates JWT access tokens and validates that the user's perm_version
// in the token still matches the current value in the database. If the role set
// has changed (perm_version bumped by the DB trigger), the request is rejected
// with PERM_VERSION_CHANGED so the frontend can auto-refresh and obtain a
// token reflecting the latest permissions.
func AuthN(pool *pgxpool.Pool, kp *auth.KeyPair) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := ""
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				token = strings.TrimPrefix(h, "Bearer ")
			}
			if token == "" {
				if c, err := r.Cookie("access_token"); err == nil {
					token = c.Value
				}
			}
			if token == "" {
				writeAuthError(w, http.StatusUnauthorized, "AUTH_FAILED", "Missing access token")
				return
			}

			claims, err := auth.VerifyAccessToken(token, kp)
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "AUTH_FAILED", "Invalid or expired token")
				return
			}

			// Validate perm_version: reject if the user's role set has changed
			// since the token was issued. Frontend auto-refreshes to pick up
			// the new perm_version on the next attempt.
			var currentPermVersion int
			err = pool.QueryRow(r.Context(),
				`SELECT perm_version FROM users WHERE id = $1 AND tenant_id = $2`,
				claims.Subject, claims.TenantID,
			).Scan(&currentPermVersion)
			if errors.Is(err, pgx.ErrNoRows) {
				writeAuthError(w, http.StatusUnauthorized, "AUTH_FAILED", "User not found or deactivated")
				return
			}
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "INTERNAL", "Failed to verify permissions")
				return
			}
			if currentPermVersion != claims.PermVersion {
				writeAuthError(w, http.StatusUnauthorized, "PERM_VERSION_CHANGED", "Permissions changed, re-authenticating")
				return
			}

			w.Header().Set("X-User-ID", claims.Subject)
			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeAuthError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"code":"` + code + `","message":"` + msg + `"}`))
}

package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

// Profile serves self-service profile endpoints.
// Full-name & avatar updates live on /users/me (UpdateMe / UploadAvatar);
// this handler adds password change with reuse prevention.
type Profile struct {
	pool *pgxpool.Pool
}

func NewProfile(pool *pgxpool.Pool) *Profile { return &Profile{pool: pool} }

type changePasswordPayload struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword handles POST /api/v1/users/me/password.
// - verifies current password
// - rejects new password equal to current (reuse prevention)
// - revokes all OTHER refresh families (this device stays signed in)
// - bumps perm_version so the access token refreshes seamlessly
// - writes an audit row (no secret material)
func (h *Profile) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload changePasswordPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if len(payload.NewPassword) < 8 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "New password must be at least 8 characters"))
		return
	}

	var currentHash string
	err := h.pool.QueryRow(r.Context(), `
		SELECT password_hash FROM users WHERE id = $1 AND tenant_id = $2`,
		claims.Subject, claims.TenantID).Scan(&currentHash)
	if err == pgx.ErrNoRows {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "User not found"))
		return
	}
	if err != nil {
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to load user"))
		return
	}

	okCurrent, err := auth.VerifyPassword(payload.CurrentPassword, currentHash)
	if err != nil || !okCurrent {
		httperr.Write(w, httperr.New("CURRENT_PASSWORD_INCORRECT", http.StatusUnprocessableEntity, "Current password is incorrect"))
		return
	}
	reused, err := auth.VerifyPassword(payload.NewPassword, currentHash)
	if err == nil && reused {
		httperr.Write(w, httperr.New("PASSWORD_REUSED", http.StatusUnprocessableEntity, "New password must be different from the current password"))
		return
	}

	newHash, err := auth.HashPassword(payload.NewPassword)
	if err != nil {
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to hash password"))
		return
	}

	// Identify this device's refresh family so it stays alive.
	keepHash := ""
	if c, cerr := r.Cookie("refresh_token"); cerr == nil && c.Value != "" {
		sum := sha256.Sum256([]byte(c.Value))
		keepHash = hex.EncodeToString(sum[:])
	}

	err = pg.WithTx(r.Context(), h.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `
			UPDATE users
			SET password_hash = $1, perm_version = perm_version + 1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`,
			newHash, claims.Subject, claims.TenantID); err != nil {
			return err
		}
		if keepHash != "" {
			if _, err := tx.Exec(r.Context(), `
				UPDATE refresh_families SET revoked_at = now()
				WHERE user_id = $1 AND revoked_at IS NULL
				  AND id NOT IN (SELECT family_id FROM refresh_tokens WHERE token_hash = $2)`,
				claims.Subject, keepHash); err != nil {
				return err
			}
		} else if _, err := tx.Exec(r.Context(), `
			UPDATE refresh_families SET revoked_at = now()
			WHERE user_id = $1 AND revoked_at IS NULL`, claims.Subject); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `
			UPDATE refresh_tokens SET status = 'revoked'
			WHERE status <> 'revoked'
			  AND family_id IN (SELECT id FROM refresh_families WHERE user_id = $1 AND revoked_at IS NOT NULL)`,
			claims.Subject); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), `
			INSERT INTO audit_logs (tenant_id, actor_user_id, event_type, entity_type, entity_id, old_data, new_data)
			VALUES ($1, $2, 'UPDATE', 'users', $2, NULL, '{"password_changed": true}')`,
			claims.TenantID, claims.Subject)
		return err
	})
	if err != nil {
		httperr.Write(w, httperr.New("PASSWORD_CHANGE_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "password_changed"})
}

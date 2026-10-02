package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

const maxAvatarBytes = 1 << 20

var avatarMimes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

type Users struct {
	pool *pgxpool.Pool
}

func NewUsers(pool *pgxpool.Pool) *Users {
	return &Users{pool: pool}
}

// Me handles GET /api/v1/users/me.
func (h *Users) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var fullName, email string
	var hasAvatar bool
	err := h.pool.QueryRow(r.Context(), `
		SELECT full_name, email, avatar_data IS NOT NULL
		FROM users WHERE id = $1 AND tenant_id = $2`,
		claims.Subject, claims.TenantID).Scan(&fullName, &email, &hasAvatar)
	if err != nil {
		httperr.Write(w, httperr.New("NOT_FOUND", http.StatusNotFound, "User not found"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"user_id":   claims.Subject,
		"tenant_id": claims.TenantID,
		"full_name": fullName,
		"email":     email,
		"has_avatar": hasAvatar,
	}})
}

// UpdateMe handles PATCH /api/v1/users/me.
func (h *Users) UpdateMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var req struct {
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FullName == "" || len(req.FullName) > 200 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Full name is required"))
		return
	}
	_, err := h.pool.Exec(r.Context(), `
		UPDATE users SET full_name = $1, updated_at = now()
		WHERE id = $2 AND tenant_id = $3`,
		req.FullName, claims.Subject, claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// UploadAvatar handles POST /api/v1/users/me/avatar with a base64 payload.
func (h *Users) UploadAvatar(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var req struct {
		Mime string `json:"mime"`
		Data string `json:"data_base64"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if !avatarMimes[req.Mime] {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Unsupported image type"))
		return
	}
	raw, err := base64.StdEncoding.DecodeString(req.Data)
	if err != nil || len(raw) == 0 || len(raw) > maxAvatarBytes {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Image must be base64 and at most 1 MB"))
		return
	}
	_, err = h.pool.Exec(r.Context(), `
		UPDATE users SET avatar_mime = $1, avatar_data = $2, updated_at = now()
		WHERE id = $3 AND tenant_id = $4`,
		req.Mime, raw, claims.Subject, claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "uploaded"})
}

// GetAvatar handles GET /api/v1/users/me/avatar and streams the stored image.
func (h *Users) GetAvatar(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var mime string
	var data []byte
	err := h.pool.QueryRow(r.Context(), `
		SELECT avatar_mime, avatar_data FROM users
		WHERE id = $1 AND tenant_id = $2`,
		claims.Subject, claims.TenantID).Scan(&mime, &data)
	if err != nil || data == nil {
		httperr.Write(w, httperr.New("NOT_FOUND", http.StatusNotFound, "Avatar not set"))
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

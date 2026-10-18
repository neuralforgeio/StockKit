package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/users"
)

// UsersMgmt serves administrative user & role management endpoints.
// All routes are protected by RequireRole(owner, developer) in router.go.
type UsersMgmt struct {
	repo *users.Repository
}

type resetPasswordPayload struct {
	Password string `json:"password"`
}

type createUserPayload struct {
	Email    string   `json:"email"`
	FullName string   `json:"full_name"`
	Password string   `json:"password"`
	Roles    []string `json:"roles"`
}

func NewUsersMgmt(repo *users.Repository) *UsersMgmt {
	return &UsersMgmt{repo: repo}
}

// List handles GET /api/v1/users-mgmt
func (h *UsersMgmt) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.repo.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// Get handles GET /api/v1/users-mgmt/{id}
func (h *UsersMgmt) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	u, err := h.repo.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": u})
}

// ListRoles handles GET /api/v1/users-mgmt/roles
func (h *UsersMgmt) ListRoles(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	roles, err := h.repo.ListRoles(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": roles})
}

type roleActionPayload struct {
	RoleName string `json:"role_name"`
}

// AssignRole handles POST /api/v1/users-mgmt/{id}/roles.
// Privilege guard: granting "developer" requires the actor to be a developer.
func (h *UsersMgmt) AssignRole(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload roleActionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.RoleName == "" {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "role_name required"))
		return
	}
	userID := chi.URLParam(r, "id")

	if payload.RoleName == "developer" {
		isDev, err := h.repo.HasRole(r.Context(), claims.TenantID, claims.Subject, "developer")
		if err != nil {
			httperr.Write(w, err)
			return
		}
		if !isDev {
			httperr.Write(w, httperr.New("FORBIDDEN", http.StatusForbidden, "Only developers can grant the developer role"))
			return
		}
	}

	if err := h.repo.AssignRole(r.Context(), claims.TenantID, userID, payload.RoleName); err != nil {
		httperr.Write(w, httperr.New("ASSIGN_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	u, err := h.repo.GetByID(r.Context(), claims.TenantID, userID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": u})
}

// RevokeRole handles DELETE /api/v1/users-mgmt/{id}/roles/{role}.
// perm_version bump happens automatically via DB trigger on user_roles.
func (h *UsersMgmt) RevokeRole(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	userID := chi.URLParam(r, "id")
	roleName := chi.URLParam(r, "role")
	if err := h.repo.RevokeRole(r.Context(), claims.TenantID, userID, roleName); err != nil {
		httperr.Write(w, httperr.New("REVOKE_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	u, err := h.repo.GetByID(r.Context(), claims.TenantID, userID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": u})
}

// Create handles POST /api/v1/users-mgmt.
// Validates input, hashes password, inserts user + grants roles atomically.
// Duplicate email returns 409 USER_EXISTS.
func (h *UsersMgmt) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload createUserPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.FullName = strings.TrimSpace(payload.FullName)

	if !strings.Contains(payload.Email, "@") {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Valid email is required"))
		return
	}
	if payload.FullName == "" {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Full name is required"))
		return
	}
	if len(payload.Password) < 8 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Password must be at least 8 characters"))
		return
	}
	if len(payload.Roles) == 0 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Select at least one role"))
		return
	}

	// Privilege guard: granting "developer" requires the actor to be a developer.
	for _, rn := range payload.Roles {
		if rn == "developer" {
			isDev, err := h.repo.HasRole(r.Context(), claims.TenantID, claims.Subject, "developer")
			if err != nil {
				httperr.Write(w, err)
				return
			}
			if !isDev {
				httperr.Write(w, httperr.New("FORBIDDEN", http.StatusForbidden, "Only developers can grant the developer role"))
				return
			}
		}
	}

	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to hash password"))
		return
	}

	u, err := h.repo.Create(r.Context(), claims.TenantID, users.CreateUserInput{
		Email:        payload.Email,
		FullName:     payload.FullName,
		PasswordHash: hash,
		Roles:        payload.Roles,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			httperr.Write(w, httperr.New("USER_EXISTS", http.StatusConflict, "Email already registered"))
			return
		}
		httperr.Write(w, httperr.New("CREATE_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": u})
}

// ResetPassword handles POST /api/v1/users-mgmt/{id}/reset-password.
// Sets a new hash, bumps perm_version, and revokes ALL refresh families/tokens
// so the target user is logged out from every device.
func (h *UsersMgmt) ResetPassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload resetPasswordPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.Password) < 8 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Password must be at least 8 characters"))
		return
	}

	hash, err := auth.HashPassword(payload.Password)
	if err != nil {
		httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to hash password"))
		return
	}

	if err := h.repo.ResetPassword(r.Context(), claims.TenantID, chi.URLParam(r, "id"), hash); err != nil {
		httperr.Write(w, httperr.New("RESET_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "password_reset"})
}

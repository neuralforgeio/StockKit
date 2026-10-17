package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/users"
)

type UsersMgmt struct {
	repo *users.Repository
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

// AssignRole handles POST /api/v1/users-mgmt/{id}/roles
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
	if err := h.repo.AssignRole(r.Context(), claims.TenantID, userID, payload.RoleName); err != nil {
		httperr.Write(w, httperr.New("ASSIGN_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	// Return updated user
	u, err := h.repo.GetByID(r.Context(), claims.TenantID, userID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": u})
}

// RevokeRole handles DELETE /api/v1/users-mgmt/{id}/roles/{role}
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

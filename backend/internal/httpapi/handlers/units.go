package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/units"
)

type Units struct {
	repo *units.Repository
}

func NewUnits(repo *units.Repository) *Units {
	return &Units{repo: repo}
}

type unitPayload struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

func mapUnitError(err error) error {
	switch {
	case errors.Is(err, units.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Unit not found")
	case errors.Is(err, units.ErrReferenced):
		return httperr.New("REFERENCED_CANNOT_DELETE", http.StatusConflict, "Unit is used by products. Reassign products first, or deactivate it.")
	case isDuplicateKey(err):
		return httperr.New("DUPLICATE_CODE", http.StatusConflict, "Unit code already exists")
	default:
		return err
	}
}

// List handles GET /api/v1/units.
func (h *Units) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.repo.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapUnitError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// Create handles POST /api/v1/units.
func (h *Units) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload unitPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if payload.Code == "" || payload.Name == "" {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Code and name are required"))
		return
	}
	unit, err := h.repo.Create(r.Context(), claims.TenantID, units.CreateUnitInput{Code: payload.Code, Name: payload.Name})
	if err != nil {
		httperr.Write(w, mapUnitError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": unit})
}

// Update handles PATCH /api/v1/units/{id}.
func (h *Units) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload unitPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if payload.Code == "" || payload.Name == "" {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Code and name are required"))
		return
	}
	unit, err := h.repo.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), units.CreateUnitInput{Code: payload.Code, Name: payload.Name})
	if err != nil {
		httperr.Write(w, mapUnitError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": unit})
}

// Delete handles DELETE /api/v1/units/{id} as a guarded soft delete.
func (h *Units) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.repo.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapUnitError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

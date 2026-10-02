package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/warehouses"
)

type Warehouses struct {
	svc *warehouses.Service
}

func NewWarehouses(svc *warehouses.Service) *Warehouses {
	return &Warehouses{svc: svc}
}

type warehousePayload struct {
	Name   string  `json:"name"`
	Branch *string `json:"branch"`
}

func (p warehousePayload) input() warehouses.CreateWarehouseInput {
	return warehouses.CreateWarehouseInput{Name: p.Name, Branch: p.Branch}
}

func mapWarehouseError(err error) error {
	switch {
	case errors.Is(err, warehouses.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Warehouse not found")
	case errors.Is(err, warehouses.ErrNameRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, warehouses.ErrReferenced):
		return httperr.New("REFERENCED_CANNOT_DELETE", http.StatusConflict, "Warehouse still holds stock. Move or consume stock first, or deactivate it.")
	default:
		return err
	}
}

// List handles GET /api/v1/warehouses.
func (h *Warehouses) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetByID handles GET /api/v1/warehouses/{id}.
func (h *Warehouses) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	wh, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": wh})
}

// Create handles POST /api/v1/warehouses.
func (h *Warehouses) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload warehousePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	wh, err := h.svc.Create(r.Context(), claims.TenantID, payload.input())
	if err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": wh})
}

// Update handles PATCH /api/v1/warehouses/{id}.
func (h *Warehouses) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload warehousePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	wh, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": wh})
}

// SetActive handles PATCH /api/v1/warehouses/{id}/status.
func (h *Warehouses) SetActive(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var req struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if err := h.svc.SetActive(r.Context(), claims.TenantID, chi.URLParam(r, "id"), req.Active); err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Delete handles DELETE /api/v1/warehouses/{id} as a guarded soft delete.
func (h *Warehouses) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapWarehouseError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

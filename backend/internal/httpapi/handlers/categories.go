package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/categories"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Categories struct {
	svc *categories.Service
}

func NewCategories(svc *categories.Service) *Categories {
	return &Categories{svc: svc}
}

type categoryPayload struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id"`
}

func (p categoryPayload) input() categories.CreateCategoryInput {
	return categories.CreateCategoryInput{Name: p.Name, ParentID: p.ParentID}
}

func mapCategoryError(err error) error {
	switch {
	case errors.Is(err, categories.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Category not found")
	case errors.Is(err, categories.ErrNameRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, categories.ErrCircularParent):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Category cannot be its own parent or descendant")
	case errors.Is(err, categories.ErrReferenced):
		return httperr.New("REFERENCED_CANNOT_DELETE", http.StatusConflict, "Category is used by products or has children. Reassign first, or deactivate it.")
	case isDuplicateKey(err):
		return httperr.New("DUPLICATE_CODE", http.StatusConflict, "Category name already exists")
	default:
		return err
	}
}

// List handles GET /api/v1/categories.
func (h *Categories) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetByID handles GET /api/v1/categories/{id}.
func (h *Categories) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	cat, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": cat})
}

// Create handles POST /api/v1/categories.
func (h *Categories) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload categoryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	cat, err := h.svc.Create(r.Context(), claims.TenantID, payload.input())
	if err != nil {
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": cat})
}

// Update handles PATCH /api/v1/categories/{id}.
func (h *Categories) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload categoryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	cat, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": cat})
}

// SetActive handles PATCH /api/v1/categories/{id}/status.
func (h *Categories) SetActive(w http.ResponseWriter, r *http.Request) {
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
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Delete handles DELETE /api/v1/categories/{id} as a guarded soft delete.
func (h *Categories) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapCategoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

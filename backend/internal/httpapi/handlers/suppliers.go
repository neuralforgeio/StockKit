package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/suppliers"
)

type Suppliers struct {
	svc *suppliers.Service
}

func NewSuppliers(svc *suppliers.Service) *Suppliers {
	return &Suppliers{svc: svc}
}

type supplierPayload struct {
	Name             string  `json:"name"`
	ContactName      string  `json:"contact_name"`
	Email            *string `json:"email"`
	Phone            string  `json:"phone"`
	Address          string  `json:"address"`
	TaxID            string  `json:"tax_id"`
	PaymentTermsDays int     `json:"payment_terms_days"`
	BankAccount      *string `json:"bank_account"`
}

func (p supplierPayload) input() suppliers.CreateSupplierInput {
	return suppliers.CreateSupplierInput{
		Name:             p.Name,
		ContactName:      p.ContactName,
		Email:            p.Email,
		Phone:            p.Phone,
		Address:          p.Address,
		TaxID:            p.TaxID,
		PaymentTermsDays: p.PaymentTermsDays,
		BankAccount:      p.BankAccount,
	}
}

func mapSupplierError(err error) error {
	switch {
	case errors.Is(err, suppliers.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Supplier not found")
	case errors.Is(err, suppliers.ErrNameRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, suppliers.ErrEncryptionNotConfigured):
		return httperr.New("INTERNAL", http.StatusInternalServerError, "Field encryption key not configured")
	default:
		return err
	}
}

// List handles GET /api/v1/suppliers.
func (h *Suppliers) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetByID handles GET /api/v1/suppliers/{id}.
func (h *Suppliers) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	sup, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": sup})
}

// Create handles POST /api/v1/suppliers.
func (h *Suppliers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload supplierPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	sup, err := h.svc.Create(r.Context(), claims.TenantID, payload.input())
	if err != nil {
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": sup})
}

// Update handles PATCH /api/v1/suppliers/{id}.
func (h *Suppliers) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload supplierPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	sup, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": sup})
}

// SetActive handles PATCH /api/v1/suppliers/{id}/status.
func (h *Suppliers) SetActive(w http.ResponseWriter, r *http.Request) {
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
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Delete handles DELETE /api/v1/suppliers/{id} as a soft delete.
func (h *Suppliers) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapSupplierError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/customers"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Customers struct {
	svc *customers.Service
}

func NewCustomers(svc *customers.Service) *Customers {
	return &Customers{svc: svc}
}

type customerPayload struct {
	Name             string  `json:"name"`
	Type             string  `json:"type"`
	ContactName      string  `json:"contact_name"`
	Email            *string `json:"email"`
	Phone            string  `json:"phone"`
	Address          string  `json:"address"`
	TaxID            string  `json:"tax_id"`
	PaymentTermsDays int     `json:"payment_terms_days"`
	CreditLimitMinor int64   `json:"credit_limit_minor"`
}

func (p customerPayload) input() customers.CreateCustomerInput {
	return customers.CreateCustomerInput{
		Name:             p.Name,
		Type:             p.Type,
		ContactName:      p.ContactName,
		Email:            p.Email,
		Phone:            p.Phone,
		Address:          p.Address,
		TaxID:            p.TaxID,
		PaymentTermsDays: p.PaymentTermsDays,
		CreditLimitMinor: p.CreditLimitMinor,
	}
}

func mapCustomerError(err error) error {
	switch {
	case errors.Is(err, customers.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Customer not found")
	case errors.Is(err, customers.ErrNameRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	default:
		return err
	}
}

// List handles GET /api/v1/customers.
func (h *Customers) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetByID handles GET /api/v1/customers/{id}.
func (h *Customers) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	cust, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": cust})
}

// Create handles POST /api/v1/customers.
func (h *Customers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload customerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	cust, err := h.svc.Create(r.Context(), claims.TenantID, payload.input())
	if err != nil {
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": cust})
}

// Update handles PATCH /api/v1/customers/{id}.
func (h *Customers) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload customerPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	cust, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": cust})
}

// SetActive handles PATCH /api/v1/customers/{id}/status.
func (h *Customers) SetActive(w http.ResponseWriter, r *http.Request) {
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
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Delete handles DELETE /api/v1/customers/{id} as a soft delete.
func (h *Customers) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapCustomerError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

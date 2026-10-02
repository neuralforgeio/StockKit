package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/neuralforgeio/StockKit/internal/finance"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Finance struct {
	svc *finance.Service
}

func NewFinance(svc *finance.Service) *Finance {
	return &Finance{svc: svc}
}

func mapFinanceError(err error) error {
	switch {
	case errors.Is(err, finance.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Cash account not found")
	case errors.Is(err, finance.ErrAccountInUse):
		return httperr.New("ACCOUNT_IN_USE", http.StatusConflict, "Cash account has payments; deactivate instead")
	case errors.Is(err, finance.ErrInvalidTransition):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid input")
	default:
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return httperr.New("DUPLICATE_CODE", http.StatusConflict, "Account number already exists")
		}
		return err
	}
}

type cashAccountPayload struct {
	Name         string  `json:"name"`
	AccountType  string  `json:"account_type"`
	Currency     string  `json:"currency"`
	BalanceMinor int64   `json:"balance_minor"`
	Notes        string  `json:"notes"`
}

func (h *Finance) ListCashAccounts(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Finance) GetCashAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	a, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": a})
}

func (h *Finance) CreateCashAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload cashAccountPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	a, err := h.svc.Create(r.Context(), claims.TenantID, finance.CreateInput{
		Name:         payload.Name,
		AccountType:  payload.AccountType,
		Currency:     payload.Currency,
		BalanceMinor: payload.BalanceMinor,
		Notes:        payload.Notes,
	})
	if err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": a})
}

type cashAccountUpdatePayload struct {
	Name        *string `json:"name"`
	AccountType *string `json:"account_type"`
	Notes       *string `json:"notes"`
}

func (h *Finance) UpdateCashAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload cashAccountUpdatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	a, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), finance.UpdateInput{
		Name:        payload.Name,
		AccountType: payload.AccountType,
		Notes:       payload.Notes,
	})
	if err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": a})
}

func (h *Finance) SetCashAccountActive(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload struct {
		Active bool `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	a, err := h.svc.SetActive(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.Active)
	if err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": a})
}

func (h *Finance) DeleteCashAccount(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapFinanceError(err))
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

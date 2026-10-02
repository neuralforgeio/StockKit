package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/neuralforgeio/StockKit/internal/fx"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type FX struct{ svc *fx.Service }

func NewFX(svc *fx.Service) *FX { return &FX{svc: svc} }

func (h *FX) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *FX) Latest(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	base := r.URL.Query().Get("base")
	quote := r.URL.Query().Get("quote")
	if base == "" {
		base = "USD"
	}
	if quote == "" {
		quote = "IDR"
	}
	rt, err := h.svc.Latest(r.Context(), claims.TenantID, base, quote)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": rt})
}

func (h *FX) Upsert(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var p struct {
		BaseCurrency  string  `json:"base_currency"`
		QuoteCurrency string  `json:"quote_currency"`
		Rate          float64 `json:"rate"`
		EffectiveDate string  `json:"effective_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	rt, err := h.svc.Upsert(r.Context(), claims.TenantID, p.BaseCurrency, p.QuoteCurrency, p.Rate, p.EffectiveDate, "manual", &claims.Subject)
	if err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": rt})
}

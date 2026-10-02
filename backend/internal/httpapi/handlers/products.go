package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	mw "github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
	"github.com/neuralforgeio/StockKit/internal/products"
)

type Products struct {
	svc *products.Service
}

func NewProducts(svc *products.Service) *Products {
	return &Products{svc: svc}
}

type productPayload struct {
	SKU                   string  `json:"sku"`
	Barcode               *string `json:"barcode"`
	Name                  string  `json:"name"`
	Type                  string  `json:"type"`
	CategoryID            *string `json:"category_id"`
	UnitID                string  `json:"unit_id"`
	CostMethod            string  `json:"cost_method"`
	DefaultSellPriceMinor int64   `json:"default_sell_price_minor"`
	DefaultBuyPriceMinor  int64   `json:"default_buy_price_minor"`
	MinStock              int64   `json:"min_stock"`
}

func (p productPayload) input() products.CreateProductInput {
	return products.CreateProductInput{
		SKU:                   p.SKU,
		Barcode:               p.Barcode,
		Name:                  p.Name,
		Type:                  p.Type,
		CategoryID:            p.CategoryID,
		UnitID:                p.UnitID,
		CostMethod:            p.CostMethod,
		DefaultSellPriceMinor: p.DefaultSellPriceMinor,
		DefaultBuyPriceMinor:  p.DefaultBuyPriceMinor,
		MinStock:              p.MinStock,
	}
}

func requestClaims(r *http.Request) (*auth.Claims, bool) {
	claims, ok := r.Context().Value(mw.ClaimsKey).(*auth.Claims)
	return claims, ok
}

func mapProductError(err error) error {
	switch {
	case errors.Is(err, products.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Product not found")
	case errors.Is(err, products.ErrSKURequired),
		errors.Is(err, products.ErrNameRequired),
		errors.Is(err, products.ErrUnitRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case isDuplicateKey(err):
		return httperr.New("DUPLICATE_CODE", http.StatusConflict, "SKU already exists among active products")
	default:
		return err
	}
}

func isDuplicateKey(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// NextSKU handles GET /api/v1/products/next-sku with a non-reserved suggestion.
func (h *Products) NextSKU(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	sku, err := h.svc.NextSKU(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]string{"sku": sku}})
}

// List handles GET /api/v1/products with cursor pagination.
func (h *Products) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	limit := 25
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 100 {
			httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Limit must be between 1 and 100"))
			return
		}
		limit = parsed
	}

	var cursor *string
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		cursor = &raw
	}

	items, nextCursor, err := h.svc.List(r.Context(), claims.TenantID, limit, cursor)
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":        items,
		"next_cursor": nextCursor,
	})
}

// GetByID handles GET /api/v1/products/{id}.
func (h *Products) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	product, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": product})
}

// Create handles POST /api/v1/products.
func (h *Products) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var payload productPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}

	product, err := h.svc.Create(r.Context(), claims.TenantID, payload.input())
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{"data": product})
}

// Update handles PATCH /api/v1/products/{id}.
func (h *Products) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var payload productPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}

	product, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": product})
}

// Delete handles DELETE /api/v1/products/{id} as a soft delete.
func (h *Products) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

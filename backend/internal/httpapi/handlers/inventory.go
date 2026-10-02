package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/inventory"
)

type Inventory struct {
	svc *inventory.Service
}

func NewInventory(svc *inventory.Service) *Inventory {
	return &Inventory{svc: svc}
}

func mapInventoryError(err error) error {
	switch {
	case errors.Is(err, inventory.ErrStockInsufficient):
		return httperr.New("STOCK_INSUFFICIENT", http.StatusConflict, "Stock insufficient for this adjustment")
	case errors.Is(err, inventory.ErrInvalidTransition):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, inventory.ErrQtyInvalid):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	default:
		return err
	}
}

// ListStockLevels handles GET /api/v1/inventory/stock-levels.
func (h *Inventory) ListStockLevels(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListStockLevels(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapInventoryError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// ListMovements handles GET /api/v1/inventory/movements.
func (h *Inventory) ListMovements(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var productID, warehouseID *string
	if raw := r.URL.Query().Get("product_id"); raw != "" {
		productID = &raw
	}
	if raw := r.URL.Query().Get("warehouse_id"); raw != "" {
		warehouseID = &raw
	}

	limit := 25
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}

	var cursor *int64
	if raw := r.URL.Query().Get("cursor"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			cursor = &parsed
		}
	}

	movements, nextCursor, err := h.svc.ListMovements(r.Context(), claims.TenantID, productID, warehouseID, limit, cursor)
	if err != nil {
		httperr.Write(w, mapInventoryError(err))
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":        movements,
		"next_cursor": nextCursor,
	})
}

type adjustmentPayload struct {
	ProductID     string `json:"product_id"`
	WarehouseID   string `json:"warehouse_id"`
	MovementType  string `json:"movement_type"`
	Qty           int64  `json:"qty"`
	UnitCostMinor int64  `json:"unit_cost_minor"`
	Reason        string `json:"reason"`
}

// RecordAdjustment handles POST /api/v1/inventory/adjustments.
func (h *Inventory) RecordAdjustment(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload adjustmentPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}

	movement, err := h.svc.RecordAdjustment(r.Context(), claims.TenantID, inventory.AdjustmentInput{
		ProductID:     payload.ProductID,
		WarehouseID:   payload.WarehouseID,
		MovementType:  payload.MovementType,
		Qty:           payload.Qty,
		UnitCostMinor: payload.UnitCostMinor,
		Reason:        payload.Reason,
		ActorUserID:   claims.Subject,
	})
	if err != nil {
		httperr.Write(w, mapInventoryError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": movement})
}

package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/purchasing"
)

type Purchasing struct {
	svc *purchasing.Service
}

func NewPurchasing(svc *purchasing.Service) *Purchasing {
	return &Purchasing{svc: svc}
}

func mapPurchasingError(err error) error {
	switch {
	case errors.Is(err, purchasing.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Purchasing document not found")
	case errors.Is(err, purchasing.ErrInvalidTransition):
		return httperr.New("ILLEGAL_TRANSITION", http.StatusConflict, err.Error())
	case errors.Is(err, purchasing.ErrLineExhausted):
		return httperr.New("LINE_EXHAUSTED", http.StatusConflict, err.Error())
	case errors.Is(err, purchasing.ErrQtyExceeded):
		return httperr.New("QTY_EXCEEDED", http.StatusConflict, err.Error())
	default:
		return err
	}
}

type purchaseRequestPayload struct {
	CostCenter *string `json:"cost_center"`
	Reason     string  `json:"reason"`
	Currency   string  `json:"currency"`
	Lines      []struct {
		ProductID           string  `json:"product_id"`
		Quantity            int64   `json:"quantity"`
		EstimatedPriceMinor int64   `json:"estimated_price_minor"`
		Note                *string `json:"note"`
	} `json:"lines"`
}

func (p purchaseRequestPayload) input() purchasing.CreatePurchaseRequestInput {
	lines := make([]purchasing.CreatePurchaseRequestLineInput, len(p.Lines))
	for i, l := range p.Lines {
		lines[i] = purchasing.CreatePurchaseRequestLineInput{
			ProductID:           l.ProductID,
			Quantity:            l.Quantity,
			EstimatedPriceMinor: l.EstimatedPriceMinor,
			Note:                l.Note,
		}
	}
	return purchasing.CreatePurchaseRequestInput{
		CostCenter: p.CostCenter,
		Reason:     p.Reason,
		Lines:      lines,
	}
}

func (h *Purchasing) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Purchasing) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	pr, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pr})
}

func (h *Purchasing) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload purchaseRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	lines := make([]purchasing.CreatePurchaseRequestLineInput, len(payload.Lines))
	for i, l := range payload.Lines {
		lines[i] = purchasing.CreatePurchaseRequestLineInput{
			ProductID: l.ProductID, Quantity: l.Quantity, EstimatedPriceMinor: l.EstimatedPriceMinor, Note: l.Note,
		}
	}
	pr, err := h.svc.CreateWithCurrency(r.Context(), claims.TenantID, claims.Subject, purchasing.CreatePurchaseRequestInput{
		CostCenter: payload.CostCenter, Reason: payload.Reason, Lines: lines,
	}, payload.Currency)
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": pr})
}

func (h *Purchasing) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload purchaseRequestPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	pr, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.input())
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pr})
}

func (h *Purchasing) Submit(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	pr, inst, err := h.svc.Submit(r.Context(), claims.TenantID, claims.Subject, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pr, "approval": inst})
}

func (h *Purchasing) Cancel(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	pr, err := h.svc.Cancel(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pr})
}

type convertPRPayload struct {
	SupplierID   string  `json:"supplier_id"`
	WarehouseID  string  `json:"warehouse_id"`
	ExpectedDate *string `json:"expected_date"`
	Lines        []struct {
		PurchaseRequestLineID string `json:"purchase_request_line_id"`
		Quantity              int64  `json:"quantity"`
		UnitPriceMinor        int64  `json:"unit_price_minor"`
	} `json:"lines"`
}

func (h *Purchasing) Convert(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload convertPRPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	lines := make([]purchasing.ConvertPRLineInput, len(payload.Lines))
	for i, l := range payload.Lines {
		lines[i] = purchasing.ConvertPRLineInput{
			PurchaseRequestLineID: l.PurchaseRequestLineID,
			Quantity:              l.Quantity,
			UnitPriceMinor:        l.UnitPriceMinor,
		}
	}
	po, err := h.svc.ConvertPRToPO(r.Context(), claims.TenantID, chi.URLParam(r, "id"), claims.Subject, purchasing.ConvertPRInput{
		SupplierID:   payload.SupplierID,
		WarehouseID:  payload.WarehouseID,
		ExpectedDate: payload.ExpectedDate,
		Lines:        lines,
	})
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": po})
}

func (h *Purchasing) ListPurchaseOrders(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListPurchaseOrders(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Purchasing) GetPurchaseOrder(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	po, err := h.svc.GetPurchaseOrder(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": po})
}

type recordGRPayload struct {
	PurchaseOrderID string `json:"purchase_order_id"`
	WarehouseID     string `json:"warehouse_id"`
	Note            string `json:"note"`
	Lines           []struct {
		PurchaseOrderLineID string  `json:"purchase_order_line_id"`
		QtyReceived         int64   `json:"qty_received"`
		UnitCostMinor       int64   `json:"unit_cost_minor"`
		DiscrepancyNote     *string `json:"discrepancy_note"`
	} `json:"lines"`
}

func (h *Purchasing) RecordGoodsReceipt(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload recordGRPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	lines := make([]purchasing.RecordGRLineInput, len(payload.Lines))
	for i, l := range payload.Lines {
		lines[i] = purchasing.RecordGRLineInput{
			PurchaseOrderLineID: l.PurchaseOrderLineID,
			QtyReceived:         l.QtyReceived,
			UnitCostMinor:       l.UnitCostMinor,
			DiscrepancyNote:     l.DiscrepancyNote,
		}
	}
	gr, err := h.svc.RecordGoodsReceipt(r.Context(), claims.TenantID, claims.Subject, purchasing.RecordGRInput{
		PurchaseOrderID: payload.PurchaseOrderID,
		WarehouseID:     payload.WarehouseID,
		Note:            payload.Note,
		Lines:           lines,
	})
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": gr})
}

func (h *Purchasing) ListGoodsReceipts(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListGoodsReceipts(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Purchasing) GetGoodsReceipt(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	gr, err := h.svc.GetGoodsReceipt(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapPurchasingError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": gr})
}

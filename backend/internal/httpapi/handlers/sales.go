package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/sales"
)

type Sales struct {
	svc *sales.Service
}

func NewSales(svc *sales.Service) *Sales {
	return &Sales{svc: svc}
}

func mapSalesError(err error) error {
	switch {
	case errors.Is(err, sales.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Sales document not found")
	case errors.Is(err, sales.ErrCustomerRequired),
		errors.Is(err, sales.ErrWarehouseRequired),
		errors.Is(err, sales.ErrLinesRequired),
		errors.Is(err, sales.ErrQtyInvalid):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, sales.ErrInvalidTransition):
		return httperr.New("ILLEGAL_TRANSITION", http.StatusConflict, "Invalid state transition")
	case errors.Is(err, sales.ErrInsufficientStock):
		// Strip sentinel prefix, keep detail
		msg := strings.TrimPrefix(err.Error(), "available stock is insufficient: ")
		if msg == err.Error() {
			msg = "Available stock is insufficient"
		}
		return httperr.New("INSUFFICIENT_STOCK", http.StatusConflict, msg)
	case errors.Is(err, sales.ErrPendingApproval):
		return httperr.New("PENDING_APPROVAL", http.StatusConflict, "Sales order pending approval")
	case errors.Is(err, sales.ErrInvoiceClosed):
		return httperr.New("INVOICE_CLOSED", http.StatusConflict, "Invoice is closed or paid")
	case errors.Is(err, sales.ErrOverpayment):
		return httperr.New("OVERPAYMENT", http.StatusConflict, "Amount exceeds remaining balance")
	case errors.Is(err, sales.ErrInsufficientCash):
		return httperr.New("INSUFFICIENT_CASH", http.StatusConflict, "Cash account balance insufficient")
	case errors.Is(err, sales.ErrLinkedDocuments):
		return httperr.New("LINKED_DOCUMENTS", http.StatusConflict, "Cannot delete: document has linked transactions")
	default:
		return err
	}
}

type salesOrderPayload struct {
	CustomerID  string `json:"customer_id"`
	WarehouseID string `json:"warehouse_id"`
	Note        string `json:"note"`
	Currency    string `json:"currency"`
	Lines       []struct {
		ProductID      string `json:"product_id"`
		Quantity       int64  `json:"quantity"`
		UnitPriceMinor int64  `json:"unit_price_minor"`
	} `json:"lines"`
}

type salesOrderUpdatePayload struct {
	CustomerID  *string `json:"customer_id"`
	WarehouseID *string `json:"warehouse_id"`
	Note        *string `json:"note"`
	Lines       *[]struct {
		ProductID      string `json:"product_id"`
		Quantity       int64  `json:"quantity"`
		UnitPriceMinor int64  `json:"unit_price_minor"`
	} `json:"lines"`
}

func (h *Sales) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Sales) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	so, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

func (h *Sales) Create(w http.ResponseWriter, r *http.Request) {
    claims, ok := requestClaims(r)
    if !ok {
        httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
        return
    }
    var payload salesOrderPayload
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
        httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
        return
    }
    lines := make([]sales.CreateLineInput, len(payload.Lines))
    for i, l := range payload.Lines {
        lines[i] = sales.CreateLineInput{ProductID: l.ProductID, Quantity: l.Quantity, UnitPriceMinor: l.UnitPriceMinor}
    }
    // PATCH: pakai CreateWithCurrency, fallback "IDR" bila kosong
    currency := payload.Currency
    if currency == "" {
        currency = "IDR"
    }
    so, err := h.svc.CreateWithCurrency(r.Context(), claims.TenantID, claims.Subject, sales.CreateInput{
        CustomerID: payload.CustomerID, WarehouseID: payload.WarehouseID, Note: payload.Note, Lines: lines,
    }, currency)
    if err != nil {
        httperr.Write(w, mapSalesError(err))
        return
    }
    writeJSON(w, http.StatusCreated, map[string]any{"data": so})
}

// Update handles PATCH /api/v1/sales-orders/{id}. Only draft SOs can be edited.
func (h *Sales) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload salesOrderUpdatePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	input := sales.UpdateInput{
		CustomerID:  payload.CustomerID,
		WarehouseID: payload.WarehouseID,
		Note:        payload.Note,
	}
	if payload.Lines != nil {
		input.Lines = make([]sales.CreateLineInput, len(*payload.Lines))
		for i, l := range *payload.Lines {
			input.Lines[i] = sales.CreateLineInput{ProductID: l.ProductID, Quantity: l.Quantity, UnitPriceMinor: l.UnitPriceMinor}
		}
	}
	so, err := h.svc.Update(r.Context(), claims.TenantID, chi.URLParam(r, "id"), input)
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

// Delete handles DELETE /api/v1/sales-orders/{id}. Only draft SOs can be deleted.
func (h *Sales) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.Delete(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Sales) Submit(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	so, err := h.svc.Submit(r.Context(), claims.TenantID, claims.Subject, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

func (h *Sales) Checkout(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	so, err := h.svc.Checkout(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

func (h *Sales) Deliver(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	so, err := h.svc.Deliver(r.Context(), claims.TenantID, chi.URLParam(r, "id"), claims.Subject)
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

func (h *Sales) Cancel(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	so, err := h.svc.Cancel(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": so})
}

type customerInvoicePayload struct {
	CustomerID   string  `json:"customer_id"`
	SalesOrderID *string `json:"sales_order_id"`
	DueDate      *string `json:"due_date"`
	Note         string  `json:"note"`
	Lines        []struct {
		SalesOrderLineID *string `json:"sales_order_line_id"`
		ProductID        string  `json:"product_id"`
		QtyInvoiced      int64   `json:"qty_invoiced"`
		UnitPriceMinor   int64   `json:"unit_price_minor"`
	} `json:"lines"`
}

func (h *Sales) ListCustomerInvoices(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListCustomerInvoices(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Sales) CreateCustomerInvoice(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload customerInvoicePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	lines := make([]sales.CreateInvoiceLineInput, len(payload.Lines))
	for i, l := range payload.Lines {
		lines[i] = sales.CreateInvoiceLineInput{
			SalesOrderLineID: l.SalesOrderLineID, ProductID: l.ProductID,
			QtyInvoiced: l.QtyInvoiced, UnitPriceMinor: l.UnitPriceMinor,
		}
	}
	inv, err := h.svc.CreateCustomerInvoice(r.Context(), claims.TenantID, claims.Subject, sales.CreateCustomerInvoiceInput{
		CustomerID: payload.CustomerID, SalesOrderID: payload.SalesOrderID,
		DueDate: payload.DueDate, Note: payload.Note, Lines: lines,
	})
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": inv})
}

type receiptPayload struct {
	CustomerInvoiceID string  `json:"customer_invoice_id"`
	CashAccountID     string  `json:"cash_account_id"`
	AmountMinor       int64   `json:"amount_minor"`
	ReceiptDate       *string `json:"receipt_date"`
	PaymentMethod     string  `json:"payment_method"`
	Reference         string  `json:"reference"`
	Note              string  `json:"note"`
}

func (h *Sales) ListCustomerReceipts(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListCustomerReceipts(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Sales) RecordCustomerReceipt(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload receiptPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	rcpt, err := h.svc.RecordCustomerReceipt(r.Context(), claims.TenantID, claims.Subject, sales.RecordReceiptInput{
		CustomerInvoiceID: payload.CustomerInvoiceID, CashAccountID: payload.CashAccountID,
		AmountMinor: payload.AmountMinor, ReceiptDate: payload.ReceiptDate,
		PaymentMethod: payload.PaymentMethod, Reference: payload.Reference, Note: payload.Note,
	})
	if err != nil {
		httperr.Write(w, mapSalesError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": rcpt})
}

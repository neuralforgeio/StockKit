package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/invoices"
)

type Invoices struct {
	svc *invoices.Service
}

func NewInvoices(svc *invoices.Service) *Invoices {
	return &Invoices{svc: svc}
}

func mapInvoiceError(err error) error {
	switch {
	case errors.Is(err, invoices.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Resource not found")
	case errors.Is(err, invoices.ErrSupplierRequired),
		errors.Is(err, invoices.ErrLinesRequired),
		errors.Is(err, invoices.ErrQtyInvalid),
		errors.Is(err, invoices.ErrPaymentInvalid):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, invoices.ErrProductRequired):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Every line must reference a catalog product")
	case errors.Is(err, invoices.ErrInvoiceClosed):
		return httperr.New("INVOICE_CLOSED", http.StatusConflict, "Invoice is closed or cash account inactive")
	case errors.Is(err, invoices.ErrOverpayment):
		return httperr.New("OVERPAYMENT", http.StatusConflict, "Amount exceeds remaining balance")
	case errors.Is(err, invoices.ErrInsufficientCash):
		return httperr.New("INSUFFICIENT_CASH", http.StatusConflict, "Cash account balance insufficient")
	default:
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return httperr.New("DUPLICATE_CODE", http.StatusConflict, "Duplicate reference")
		}
		return err
	}
}

// NextNumber handles GET /api/v1/supplier-invoices/next-number.
func (h *Invoices) NextNumber(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	number, err := h.svc.NextNumber(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]string{"number": number}})
}

func (h *Invoices) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Invoices) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	inv, err := h.svc.GetByID(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": inv})
}

type invoicePayload struct {
	SupplierID      string  `json:"supplier_id"`
	PurchaseOrderID *string `json:"purchase_order_id"`
	GoodsReceiptID  *string `json:"goods_receipt_id"`
	DueDate         *string `json:"due_date"`
	Note            string  `json:"note"`
	Lines           []struct {
		PurchaseOrderLineID *string `json:"purchase_order_line_id"`
		ProductID           string  `json:"product_id"`
		QtyInvoiced         int64   `json:"qty_invoiced"`
		UnitPriceMinor      int64   `json:"unit_price_minor"`
	} `json:"lines"`
}

func (h *Invoices) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload invoicePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	lines := make([]invoices.CreateInvoiceLineInput, len(payload.Lines))
	for i, l := range payload.Lines {
		lines[i] = invoices.CreateInvoiceLineInput{
			PurchaseOrderLineID: l.PurchaseOrderLineID,
			ProductID:           l.ProductID,
			QtyInvoiced:         l.QtyInvoiced,
			UnitPriceMinor:      l.UnitPriceMinor,
		}
	}
	inv, err := h.svc.Create(r.Context(), claims.TenantID, claims.Subject, invoices.CreateInvoiceInput{
		SupplierID:      payload.SupplierID,
		PurchaseOrderID: payload.PurchaseOrderID,
		GoodsReceiptID:  payload.GoodsReceiptID,
		DueDate:         payload.DueDate,
		Note:            payload.Note,
		Lines:           lines,
	})
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": inv})
}

type paymentPayload struct {
	SupplierInvoiceID string  `json:"supplier_invoice_id"`
	CashAccountID     string  `json:"cash_account_id"`
	AmountMinor       int64   `json:"amount_minor"`
	PaymentDate       *string `json:"payment_date"`
	PaymentMethod     string  `json:"payment_method"`
	Reference         string  `json:"reference"`
	Note              string  `json:"note"`
}

func (h *Invoices) RecordPayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload paymentPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	pay, err := h.svc.RecordPayment(r.Context(), claims.TenantID, claims.Subject, invoices.RecordPaymentInput{
		SupplierInvoiceID: payload.SupplierInvoiceID,
		CashAccountID:     payload.CashAccountID,
		AmountMinor:       payload.AmountMinor,
		PaymentDate:       payload.PaymentDate,
		PaymentMethod:     payload.PaymentMethod,
		Reference:         payload.Reference,
		Note:              payload.Note,
	})
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": pay})
}

func (h *Invoices) ListPayments(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListPayments(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

func (h *Invoices) GetPayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	pay, err := h.svc.GetPayment(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pay})
}

func (h *Invoices) CancelPayment(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	pay, err := h.svc.CancelPayment(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapInvoiceError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": pay})
}

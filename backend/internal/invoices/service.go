package invoices

import (
	"context"
	"errors"
	"strings"
)

var (
	ErrSupplierRequired = errors.New("supplier is required")
	ErrLinesRequired    = errors.New("at least one line is required")
	ErrQtyInvalid       = errors.New("invoiced quantity must be positive")
	ErrPaymentInvalid   = errors.New("payment amount must be positive")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// NextNumber returns the preview of the next system invoice number.
func (s *Service) NextNumber(ctx context.Context, tenantID string) (string, error) {
	return s.repo.NextNumber(ctx, tenantID)
}

// Create validates input and persists a supplier invoice with match evaluation.
func (s *Service) Create(ctx context.Context, tenantID, actorID string, input CreateInvoiceInput) (*SupplierInvoice, error) {
	if input.SupplierID == "" {
		return nil, ErrSupplierRequired
	}
	if len(input.Lines) == 0 {
		return nil, ErrLinesRequired
	}
	for _, line := range input.Lines {
		if line.ProductID == "" {
			return nil, ErrProductRequired
		}
		if line.QtyInvoiced <= 0 {
			return nil, ErrQtyInvalid
		}
	}
	return s.repo.Create(ctx, tenantID, actorID, input)
}

func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*SupplierInvoice, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *Service) List(ctx context.Context, tenantID string) ([]SupplierInvoice, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *Service) RecordPayment(ctx context.Context, tenantID, actorID string, input RecordPaymentInput) (*Payment, error) {
	if input.SupplierInvoiceID == "" || input.CashAccountID == "" {
		return nil, ErrPaymentInvalid
	}
	if input.AmountMinor <= 0 {
		return nil, ErrPaymentInvalid
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "transfer"
	}
	return s.repo.RecordPayment(ctx, tenantID, actorID, input)
}

func (s *Service) CancelPayment(ctx context.Context, tenantID, id string) (*Payment, error) {
	return s.repo.CancelPayment(ctx, tenantID, id)
}

func (s *Service) ListPayments(ctx context.Context, tenantID string) ([]Payment, error) {
	return s.repo.ListPayments(ctx, tenantID)
}

func (s *Service) GetPayment(ctx context.Context, tenantID, id string) (*Payment, error) {
	return s.repo.GetPayment(ctx, tenantID, id)
}

var _ = strings.TrimSpace

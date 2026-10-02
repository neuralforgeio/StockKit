package sales

import (
	"context"
	"errors"
	"fmt"

	"github.com/neuralforgeio/StockKit/internal/approval"
	"github.com/neuralforgeio/StockKit/internal/fx"
)

var (
	ErrCustomerRequired  = errors.New("customer is required")
	ErrWarehouseRequired = errors.New("warehouse is required")
	ErrLinesRequired     = errors.New("at least one line is required")
	ErrQtyInvalid        = errors.New("quantity must be positive")
	ErrPendingApproval   = errors.New("sales order pending approval")
)

type Service struct {
	repo     *Repository
	approval *approval.Service
	fx       *fx.Service
}

// NewService constructs sales service. fxSvc is optional (variadic, nil = no auto FX conversion).
// Backward-compatible with 2-param callers: NewService(repo, approvalSvc)
func NewService(repo *Repository, approvalSvc *approval.Service, fxSvc ...*fx.Service) *Service {
	var fxSvcPtr *fx.Service
	if len(fxSvc) > 0 {
		fxSvcPtr = fxSvc[0]
	}
	return &Service{repo: repo, approval: approvalSvc, fx: fxSvcPtr}
}

func (s *Service) Create(ctx context.Context, tenantID, actorID string, input CreateInput) (*SalesOrder, error) {
	if input.CustomerID == "" {
		return nil, ErrCustomerRequired
	}
	if input.WarehouseID == "" {
		return nil, ErrWarehouseRequired
	}
	if len(input.Lines) == 0 {
		return nil, ErrLinesRequired
	}
	for _, line := range input.Lines {
		if line.ProductID == "" || line.Quantity <= 0 {
			return nil, ErrQtyInvalid
		}
	}
	return s.repo.Create(ctx, tenantID, actorID, input)
}

// CreateWithCurrency creates SO with automatic FX conversion.
func (s *Service) CreateWithCurrency(ctx context.Context, tenantID, actorID string, input CreateInput, currency string) (*SalesOrder, error) {
	if input.CustomerID == "" {
		return nil, ErrCustomerRequired
	}
	if input.WarehouseID == "" {
		return nil, ErrWarehouseRequired
	}
	if len(input.Lines) == 0 {
		return nil, ErrLinesRequired
	}
	for _, line := range input.Lines {
		if line.ProductID == "" || line.Quantity <= 0 {
			return nil, ErrQtyInvalid
		}
	}

	totalMinor := int64(0)
	for _, line := range input.Lines {
		totalMinor += line.Quantity * line.UnitPriceMinor
	}

	if currency == "" {
		currency = "IDR"
	}

	var baseAmountMinor int64
	var exchangeRate float64 = 1.0
	if currency != "IDR" && s.fx != nil {
		var err error
		baseAmountMinor, exchangeRate, err = s.fx.ConvertToBase(ctx, tenantID, totalMinor, currency, "IDR")
		if err != nil {
			return nil, fmt.Errorf("convert currency: %w", err)
		}
	} else {
		baseAmountMinor = totalMinor
	}

	return s.repo.CreateWithCurrency(ctx, tenantID, actorID, input, currency, exchangeRate, baseAmountMinor)
}

func (s *Service) Update(ctx context.Context, tenantID, id string, input UpdateInput) (*SalesOrder, error) {
	if input.CustomerID != nil && *input.CustomerID == "" {
		return nil, ErrCustomerRequired
	}
	if input.WarehouseID != nil && *input.WarehouseID == "" {
		return nil, ErrWarehouseRequired
	}
	if input.Lines != nil && len(input.Lines) == 0 {
		return nil, ErrLinesRequired
	}
	for _, line := range input.Lines {
		if line.ProductID == "" || line.Quantity <= 0 {
			return nil, ErrQtyInvalid
		}
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *Service) List(ctx context.Context, tenantID string) ([]SalesOrder, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *Service) Submit(ctx context.Context, tenantID, actorID, id string) (*SalesOrder, error) {
	so, err := s.repo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	so, err = s.repo.Submit(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}

	if s.approval != nil {
		inst, err := s.approval.CreateInstance(ctx, tenantID, "SO", so.ID, so.Number, so.TotalMinor, actorID)
		if err != nil {
			return nil, err
		}
		if inst != nil {
			so.ApprovalStatus = "pending"
		} else {
			so.ApprovalStatus = "approved"
		}
	}
	return so, nil
}

func (s *Service) Checkout(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	if err := s.ensureApproved(ctx, tenantID, id); err != nil {
		return nil, err
	}
	return s.repo.Checkout(ctx, tenantID, id)
}

func (s *Service) Deliver(ctx context.Context, tenantID, id, actorID string) (*SalesOrder, error) {
	if err := s.ensureApproved(ctx, tenantID, id); err != nil {
		return nil, err
	}
	return s.repo.Deliver(ctx, tenantID, id, actorID)
}

func (s *Service) Cancel(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	return s.repo.Cancel(ctx, tenantID, id)
}

func (s *Service) ensureApproved(ctx context.Context, tenantID, id string) error {
	if s.approval == nil {
		return nil
	}
	inst, err := s.approval.GetInstanceByDocument(ctx, tenantID, "SO", id)
	if err != nil {
		return err
	}
	if inst != nil && inst.Status == "pending" {
		return ErrPendingApproval
	}
	return nil
}

func (s *Service) CreateCustomerInvoice(ctx context.Context, tenantID, actorID string, input CreateCustomerInvoiceInput) (*CustomerInvoice, error) {
	if input.CustomerID == "" {
		return nil, ErrCustomerRequired
	}
	if len(input.Lines) == 0 {
		return nil, ErrLinesRequired
	}
	for _, line := range input.Lines {
		if line.ProductID == "" || line.QtyInvoiced <= 0 {
			return nil, ErrQtyInvalid
		}
	}
	return s.repo.CreateCustomerInvoice(ctx, tenantID, actorID, input)
}

func (s *Service) ListCustomerInvoices(ctx context.Context, tenantID string) ([]CustomerInvoice, error) {
	return s.repo.ListCustomerInvoices(ctx, tenantID)
}

func (s *Service) ListCustomerReceipts(ctx context.Context, tenantID string) ([]CustomerReceipt, error) {
	return s.repo.ListCustomerReceipts(ctx, tenantID)
}

func (s *Service) RecordCustomerReceipt(ctx context.Context, tenantID, actorID string, input RecordReceiptInput) (*CustomerReceipt, error) {
	if input.CustomerInvoiceID == "" || input.CashAccountID == "" {
		return nil, ErrQtyInvalid
	}
	if input.AmountMinor <= 0 {
		return nil, ErrQtyInvalid
	}
	if input.PaymentMethod == "" {
		input.PaymentMethod = "transfer"
	}
	return s.repo.RecordCustomerReceipt(ctx, tenantID, actorID, input)
}

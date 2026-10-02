package purchasing

import (
	"context"
	"fmt"
	"strings"

	"github.com/neuralforgeio/StockKit/internal/approval"
	"github.com/neuralforgeio/StockKit/internal/fx"
)

type Service struct {
	repo      *Repository
	approvals *approval.Service
	fx        *fx.Service
}

// NewService constructs purchasing service. fxSvc is optional (nil = no auto FX conversion).
// Kept backward-compatible with 2-param callers: NewService(repo, approvals)
func NewService(repo *Repository, approvals *approval.Service, fxSvc ...*fx.Service) *Service {
	var fxSvcPtr *fx.Service
	if len(fxSvc) > 0 {
		fxSvcPtr = fxSvc[0]
	}
	return &Service{repo: repo, approvals: approvals, fx: fxSvcPtr}
}

func (s *Service) Create(ctx context.Context, tenantID, requesterID string, input CreatePurchaseRequestInput) (*PurchaseRequest, error) {
	if strings.TrimSpace(input.Reason) == "" {
		return nil, ErrInvalidTransition
	}
	if len(input.Lines) == 0 {
		return nil, ErrInvalidTransition
	}
	for _, line := range input.Lines {
		if line.Quantity <= 0 {
			return nil, ErrInvalidTransition
		}
	}
	return s.repo.Create(ctx, tenantID, requesterID, input)
}

// CreateWithCurrency creates a PR with multi-currency support.
// If currency != IDR and FX service is available, auto-converts to base (IDR).
func (s *Service) CreateWithCurrency(ctx context.Context, tenantID, requesterID string, input CreatePurchaseRequestInput, currency string) (*PurchaseRequest, error) {
	if strings.TrimSpace(input.Reason) == "" {
		return nil, ErrInvalidTransition
	}
	if len(input.Lines) == 0 {
		return nil, ErrInvalidTransition
	}
	for _, line := range input.Lines {
		if line.Quantity <= 0 {
			return nil, ErrInvalidTransition
		}
	}

	// Hitung total dalam source currency
	totalMinor := int64(0)
	for _, line := range input.Lines {
		totalMinor += line.Quantity * line.EstimatedPriceMinor
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

	return s.repo.CreateWithCurrency(ctx, tenantID, requesterID, input, currency, exchangeRate, baseAmountMinor)
}

func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*PurchaseRequest, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *Service) List(ctx context.Context, tenantID string) ([]PurchaseRequest, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *Service) Update(ctx context.Context, tenantID, id string, input CreatePurchaseRequestInput) (*PurchaseRequest, error) {
	if strings.TrimSpace(input.Reason) == "" {
		return nil, ErrInvalidTransition
	}
	if len(input.Lines) == 0 {
		return nil, ErrInvalidTransition
	}
	for _, line := range input.Lines {
		if line.Quantity <= 0 {
			return nil, ErrInvalidTransition
		}
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

// Submit transitions a draft PR to submitted. Creates approval instance if rules match.
// Returns the submitted PR, the approval instance (or nil if auto-approved), and any error.
func (s *Service) Submit(ctx context.Context, tenantID, requesterID, id string) (*PurchaseRequest, *approval.Instance, error) {
	pr, err := s.repo.GetByID(ctx, tenantID, id)
	if err != nil {
		return nil, nil, err
	}
	if pr.Status != "draft" {
		return nil, nil, ErrInvalidTransition
	}
	total := int64(0)
	for _, l := range pr.Lines {
		total += l.Quantity * l.EstimatedPriceMinor
	}
	inst, err := s.approvals.CreateInstance(ctx, tenantID, "PR", pr.ID, pr.Number, total, requesterID)
	if err != nil {
		return nil, nil, err
	}
	targetStatus := "approved"
	if inst != nil {
		targetStatus = "pending_approval"
	}
	submitted, err := s.repo.SubmitWithStatus(ctx, tenantID, id, targetStatus)
	if err != nil {
		return nil, nil, err
	}
	return submitted, inst, nil
}

func (s *Service) Cancel(ctx context.Context, tenantID, id string) (*PurchaseRequest, error) {
	return s.repo.Cancel(ctx, tenantID, id)
}

func (s *Service) ConvertPRToPO(ctx context.Context, tenantID, prID, actorID string, input ConvertPRInput) (*PurchaseOrder, error) {
	if input.SupplierID == "" || input.WarehouseID == "" {
		return nil, ErrInvalidTransition
	}
	if len(input.Lines) == 0 {
		return nil, ErrInvalidTransition
	}
	for _, line := range input.Lines {
		if line.Quantity <= 0 {
			return nil, ErrLineExhausted
		}
	}
	return s.repo.ConvertPRToPO(ctx, tenantID, prID, actorID, input)
}

func (s *Service) ListPurchaseOrders(ctx context.Context, tenantID string) ([]PurchaseOrder, error) {
	return s.repo.ListPurchaseOrders(ctx, tenantID)
}

func (s *Service) GetPurchaseOrder(ctx context.Context, tenantID, id string) (*PurchaseOrder, error) {
	return s.repo.GetPurchaseOrder(ctx, tenantID, id)
}

func (s *Service) RecordGoodsReceipt(ctx context.Context, tenantID, actorID string, input RecordGRInput) (*GoodsReceipt, error) {
	if input.PurchaseOrderID == "" || input.WarehouseID == "" {
		return nil, ErrInvalidTransition
	}
	if len(input.Lines) == 0 {
		return nil, ErrInvalidTransition
	}
	for _, line := range input.Lines {
		if line.QtyReceived <= 0 {
			return nil, ErrLineExhausted
		}
	}
	return s.repo.RecordGoodsReceipt(ctx, tenantID, actorID, input)
}

func (s *Service) ListGoodsReceipts(ctx context.Context, tenantID string) ([]GoodsReceipt, error) {
	return s.repo.ListGoodsReceipts(ctx, tenantID)
}

func (s *Service) GetGoodsReceipt(ctx context.Context, tenantID, id string) (*GoodsReceipt, error) {
	return s.repo.GetGoodsReceipt(ctx, tenantID, id)
}

// FinalizeByApproval flips PR status when the linked approval settles.
// Invoked by approval dispatcher finalizer hook.
func (s *Service) FinalizeByApproval(ctx context.Context, tenantID, id, status, actorID string) error {
	return s.repo.FinalizeByApproval(ctx, tenantID, id, status, actorID)
}

package inventory

import (
	"context"
	"strings"
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// ListStockLevels returns current stock per (product, warehouse) pair.
func (s *Service) ListStockLevels(ctx context.Context, tenantID string) ([]StockLevel, error) {
	return s.repo.ListStockLevels(ctx, tenantID)
}

// ListMovements returns a cursor page of movements, optionally filtered.
func (s *Service) ListMovements(ctx context.Context, tenantID string, productID, warehouseID *string, limit int, cursor *int64) ([]Movement, *int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	return s.repo.ListMovements(ctx, tenantID, productID, warehouseID, limit, cursor)
}

// RecordAdjustment validates and persists an ADJ_IN/ADJ_OUT movement.
func (s *Service) RecordAdjustment(ctx context.Context, tenantID string, input AdjustmentInput) (*Movement, error) {
	if input.Qty <= 0 {
		return nil, ErrQtyInvalid
	}
	if input.UnitCostMinor < 0 {
		return nil, ErrQtyInvalid
	}
	if strings.TrimSpace(input.Reason) == "" {
		return nil, ErrInvalidTransition
	}
	switch input.MovementType {
	case "ADJ_IN", "ADJ_OUT":
	default:
		return nil, ErrInvalidTransition
	}
	return s.repo.RecordAdjustment(ctx, tenantID, input)
}

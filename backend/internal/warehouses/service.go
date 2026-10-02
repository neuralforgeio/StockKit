package warehouses

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

// Create validates input and persists a new warehouse.
func (s *Service) Create(ctx context.Context, tenantID string, input CreateWarehouseInput) (*Warehouse, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	return s.repo.Create(ctx, tenantID, input)
}

// GetByID returns one warehouse or ErrNotFound.
func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*Warehouse, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

// List returns all non-deleted warehouses for one tenant.
func (s *Service) List(ctx context.Context, tenantID string) ([]Warehouse, error) {
	return s.repo.List(ctx, tenantID)
}

// Update validates input and persists changes to one warehouse.
func (s *Service) Update(ctx context.Context, tenantID, id string, input CreateWarehouseInput) (*Warehouse, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

// SetActive deactivates or reactivates a warehouse.
func (s *Service) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	return s.repo.SetActive(ctx, tenantID, id, active)
}

// Delete soft-deletes a warehouse when it holds no stock.
func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

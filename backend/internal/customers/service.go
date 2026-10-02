package customers

import (
	"context"
	"errors"
	"strings"
)

var (
	ErrNameRequired = errors.New("name is required")
)

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Create validates input and persists a new customer.
func (s *Service) Create(ctx context.Context, tenantID string, input CreateCustomerInput) (*Customer, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	if input.Type == "" {
		input.Type = "company"
	}
	return s.repo.Create(ctx, tenantID, input)
}

// GetByID returns one customer or ErrNotFound.
func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*Customer, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

// List returns all non-deleted customers for one tenant.
func (s *Service) List(ctx context.Context, tenantID string) ([]Customer, error) {
	return s.repo.List(ctx, tenantID)
}

// Update validates input and persists changes to one customer.
func (s *Service) Update(ctx context.Context, tenantID, id string, input CreateCustomerInput) (*Customer, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	if input.Type == "" {
		input.Type = "company"
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

// SetActive deactivates or reactivates a customer.
func (s *Service) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	return s.repo.SetActive(ctx, tenantID, id, active)
}

// Delete soft-deletes a customer.
func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

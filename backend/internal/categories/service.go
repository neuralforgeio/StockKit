package categories

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

// Create validates input and persists a new category.
func (s *Service) Create(ctx context.Context, tenantID string, input CreateCategoryInput) (*Category, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	return s.repo.Create(ctx, tenantID, input)
}

// GetByID returns one category or ErrNotFound.
func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*Category, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

// List returns all non-deleted categories for one tenant.
func (s *Service) List(ctx context.Context, tenantID string) ([]Category, error) {
	return s.repo.List(ctx, tenantID)
}

// Update validates input and rejects circular parent references.
func (s *Service) Update(ctx context.Context, tenantID, id string, input CreateCategoryInput) (*Category, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrNameRequired
	}
	if input.ParentID != nil {
		if *input.ParentID == id {
			return nil, ErrCircularParent
		}
		isDesc, err := s.repo.IsDescendant(ctx, tenantID, id, *input.ParentID)
		if err != nil {
			return nil, err
		}
		if isDesc {
			return nil, ErrCircularParent
		}
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

// SetActive deactivates or reactivates a category.
func (s *Service) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	return s.repo.SetActive(ctx, tenantID, id, active)
}

// Delete soft-deletes a category when unreferenced.
func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

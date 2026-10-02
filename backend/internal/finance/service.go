package finance

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

func (s *Service) Create(ctx context.Context, tenantID string, input CreateInput) (*CashAccount, error) {
	if strings.TrimSpace(input.Name) == "" {
		return nil, ErrInvalidTransition
	}
	if input.Currency == "" {
		input.Currency = "IDR"
	}
	if input.BalanceMinor < 0 {
		return nil, ErrInvalidTransition
	}
	return s.repo.Create(ctx, tenantID, input)
}

func (s *Service) List(ctx context.Context, tenantID string) ([]CashAccount, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*CashAccount, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

func (s *Service) Update(ctx context.Context, tenantID, id string, input UpdateInput) (*CashAccount, error) {
	return s.repo.Update(ctx, tenantID, id, input)
}

func (s *Service) SetActive(ctx context.Context, tenantID, id string, active bool) (*CashAccount, error) {
	return s.repo.SetActive(ctx, tenantID, id, active)
}

func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

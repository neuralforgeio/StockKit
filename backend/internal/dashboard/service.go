package dashboard

import "context"

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Summary returns the owner dashboard figures computed from source tables only.
func (s *Service) Summary(ctx context.Context, tenantID string) (*Summary, error) {
	return s.repo.Summary(ctx, tenantID)
}

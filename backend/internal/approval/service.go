package approval

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/neuralforgeio/StockKit/internal/notify"
)

var (
	ErrInvalidDecision = errors.New("decision must be 'approved' or 'rejected'")
	ErrReasonRequired  = errors.New("reason is required when rejecting")
)

type Service struct {
	repo       *Repository
	notify     *notify.Service
	finalizers []DocumentFinalizer
	logger     *slog.Logger
}

// NewService constructs the approval service. Optional finalizers are invoked
// after an instance settles (approved / rejected) so related documents can be
// transitioned atomically from the approval side.
func NewService(repo *Repository, n *notify.Service, finalizers ...DocumentFinalizer) *Service {
	return &Service{
		repo:       repo,
		notify:     n,
		finalizers: finalizers,
		logger:     slog.Default(),
	}
}

func (s *Service) RulesFor(ctx context.Context, tenantID, docType string) ([]Rule, error) {
	return s.repo.RulesFor(ctx, tenantID, docType)
}

// CreateInstance evaluates rules and creates an approval instance when applicable.
func (s *Service) CreateInstance(ctx context.Context, tenantID, docType, docID, label string, amount int64, requesterID string) (*Instance, error) {
	rules, err := s.repo.RulesFor(ctx, tenantID, docType)
	if err != nil {
		return nil, err
	}
	applicable := make([]Rule, 0)
	for _, rule := range rules {
		if rule.Active && amount >= rule.ThresholdMinor {
			applicable = append(applicable, rule)
		}
	}
	if len(applicable) == 0 {
		return nil, nil
	}

	inst, err := s.repo.CreateInstance(ctx, tenantID, docType, docID, label, amount, requesterID, applicable)
	if err != nil {
		return nil, err
	}

	if s.notify != nil && inst != nil {
		seen := map[string]bool{}
		for _, rule := range applicable {
			if seen[rule.ApproverRole] {
				continue
			}
			seen[rule.ApproverRole] = true
			users := s.notify.UsersWithRole(ctx, tenantID, rule.ApproverRole)
			s.notify.Emit(ctx, tenantID, users, "approval_requested",
				fmt.Sprintf("Approval needed: %s", label),
				fmt.Sprintf("Document %s senilai %d menunggu persetujuan Anda.", label, amount),
				docType, docID)
		}
	}
	return inst, nil
}

func (s *Service) PendingInstances(ctx context.Context, tenantID string) ([]Instance, error) {
	return s.repo.PendingInstances(ctx, tenantID)
}

func (s *Service) GetInstance(ctx context.Context, tenantID, id string) (*Instance, error) {
	return s.repo.GetInstance(ctx, tenantID, id)
}

func (s *Service) GetInstanceByDocument(ctx context.Context, tenantID, docType, docID string) (*Instance, error) {
	return s.repo.GetInstanceByDocument(ctx, tenantID, docType, docID)
}

// Decide validates and records a step decision, notifies the requester when settled,
// and invokes registered finalizers after the instance becomes approved / rejected.
func (s *Service) Decide(ctx context.Context, tenantID, stepID, decision, reason, actorID string) (*Instance, error) {
	switch decision {
	case "approved", "rejected":
	default:
		return nil, ErrInvalidDecision
	}
	if decision == "rejected" && reason == "" {
		return nil, ErrReasonRequired
	}

	inst, err := s.repo.Decide(ctx, tenantID, stepID, decision, reason, actorID)
	if err != nil {
		return nil, err
	}

	if s.notify != nil && inst != nil && (inst.Status == "approved" || inst.Status == "rejected") {
		if inst.RequesterID != "" && inst.RequesterID != actorID {
			title := "Approval disetujui"
			if inst.Status == "rejected" {
				title = "Approval ditolak"
			}
			s.notify.Emit(ctx, tenantID, []string{inst.RequesterID}, "approval_decided",
				fmt.Sprintf("%s: %s", title, inst.DocumentLabel),
				fmt.Sprintf("Status akhir: %s.", inst.Status),
				inst.DocumentType, inst.DocumentID)
		}
	}

	// Run finalizers after notify so document transitions happen last.
	// Finalizer errors are logged but never roll back the decision.
	if inst != nil && (inst.Status == "approved" || inst.Status == "rejected") {
		s.runFinalizers(ctx, inst, actorID)
	}

	return inst, nil
}

// runFinalizers invokes registered hooks after an instance is fully settled.
func (s *Service) runFinalizers(ctx context.Context, inst *Instance, actorID string) {
	if inst == nil || inst.Status == "pending" || len(s.finalizers) == 0 {
		return
	}
	for _, fn := range s.finalizers {
		if fn == nil {
			continue
		}
		if err := fn(ctx, inst.TenantID, inst.DocumentType, inst.DocumentID, inst.Status, actorID); err != nil {
			if s.logger != nil {
				s.logger.Error("approval finalizer failed",
					"doc_type", inst.DocumentType, "doc_id", inst.DocumentID,
					"status", inst.Status, "error", err)
			}
		}
	}
}

// Rules CRUD (delegated to repository; ErrRuleNotFound lives in rules.go).
func (s *Service) ListRules(ctx context.Context, tenantID string) ([]Rule, error) {
	return s.repo.ListRules(ctx, tenantID)
}

func (s *Service) CreateRule(ctx context.Context, tenantID string, rule Rule) (*Rule, error) {
	if rule.DocumentType == "" {
		return nil, errors.New("document_type is required")
	}
	if rule.ApproverRole == "" {
		return nil, errors.New("approver_role is required")
	}
	if rule.Level < 1 {
		return nil, errors.New("level must be >= 1")
	}
	return s.repo.CreateRule(ctx, tenantID, rule)
}

func (s *Service) UpdateRule(ctx context.Context, tenantID, id string, rule Rule) (*Rule, error) {
	if rule.DocumentType == "" {
		return nil, errors.New("document_type is required")
	}
	if rule.ApproverRole == "" {
		return nil, errors.New("approver_role is required")
	}
	if rule.Level < 1 {
		return nil, errors.New("level must be >= 1")
	}
	return s.repo.UpdateRule(ctx, tenantID, id, rule)
}

func (s *Service) DeleteRule(ctx context.Context, tenantID, id string) error {
	return s.repo.DeleteRule(ctx, tenantID, id)
}

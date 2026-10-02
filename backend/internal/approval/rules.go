package approval

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

var ErrRuleNotFound = errors.New("approval rule not found")

// ListRules returns approval rules ordered by document type and level.
func (r *Repository) ListRules(ctx context.Context, tenantID string) ([]Rule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, document_type, name, threshold_minor, approver_role, level, active
		FROM approval_rules
		WHERE tenant_id = $1
		ORDER BY document_type, level`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query approval rules: %w", err)
	}
	defer rows.Close()
	out := make([]Rule, 0)
	for rows.Next() {
		var rule Rule
		if err := rows.Scan(&rule.ID, &rule.DocumentType, &rule.Name, &rule.ThresholdMinor,
			&rule.ApproverRole, &rule.Level, &rule.Active); err != nil {
			return nil, fmt.Errorf("scan approval rule: %w", err)
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

// CreateRule inserts a new approval rule and returns the created row.
func (r *Repository) CreateRule(ctx context.Context, tenantID string, rule Rule) (*Rule, error) {
	var created Rule
	err := r.pool.QueryRow(ctx, `
		INSERT INTO approval_rules (tenant_id, document_type, name, threshold_minor, approver_role, level, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, document_type, name, threshold_minor, approver_role, level, active`,
		tenantID, rule.DocumentType, rule.Name, rule.ThresholdMinor, rule.ApproverRole, rule.Level, rule.Active).
		Scan(&created.ID, &created.DocumentType, &created.Name, &created.ThresholdMinor,
			&created.ApproverRole, &created.Level, &created.Active)
	if err != nil {
		return nil, fmt.Errorf("insert approval rule: %w", err)
	}
	return &created, nil
}

// UpdateRule replaces mutable fields of a rule; returns ErrRuleNotFound on miss.
func (r *Repository) UpdateRule(ctx context.Context, tenantID, id string, rule Rule) (*Rule, error) {
	var updated Rule
	err := r.pool.QueryRow(ctx, `
		UPDATE approval_rules
		SET document_type = $3, name = $4, threshold_minor = $5, approver_role = $6, level = $7, active = $8, updated_at = now()
		WHERE id = $1 AND tenant_id = $2
		RETURNING id, document_type, name, threshold_minor, approver_role, level, active`,
		id, tenantID, rule.DocumentType, rule.Name, rule.ThresholdMinor, rule.ApproverRole, rule.Level, rule.Active).
		Scan(&updated.ID, &updated.DocumentType, &updated.Name, &updated.ThresholdMinor,
			&updated.ApproverRole, &updated.Level, &updated.Active)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRuleNotFound
		}
		return nil, fmt.Errorf("update approval rule: %w", err)
	}
	return &updated, nil
}

// DeleteRule removes a rule; returns ErrRuleNotFound when nothing deleted.
func (r *Repository) DeleteRule(ctx context.Context, tenantID, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM approval_rules WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	if err != nil {
		return fmt.Errorf("delete approval rule: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrRuleNotFound
	}
	return nil
}

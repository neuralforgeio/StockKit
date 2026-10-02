package approval

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

var (
	ErrNotFound       = errors.New("approval not found")
	ErrAlreadyDecided = errors.New("step already decided")
)

type Rule struct {
	ID             string `json:"id"`
	DocumentType   string `json:"document_type"`
	Name           string `json:"name"`
	ThresholdMinor int64  `json:"threshold_minor"`
	ApproverRole   string `json:"approver_role"`
	Level          int    `json:"level"`
	Active         bool   `json:"active"`
}

type Instance struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	DocumentType  string    `json:"document_type"`
	DocumentID    string    `json:"document_id"`
	DocumentLabel string    `json:"document_label"`
	AmountMinor   int64     `json:"amount_minor"`
	Status        string    `json:"status"`
	RequesterID   string    `json:"requester_id"`
	RequesterName string    `json:"requester_name"`
	CreatedAt     time.Time `json:"created_at"`
	Steps         []Step    `json:"steps"`
}

type Step struct {
	ID           string     `json:"id"`
	InstanceID   string     `json:"instance_id"`
	Level        int        `json:"level"`
	ApproverRole string     `json:"approver_role"`
	Decision     *string    `json:"decision"`
	Status       string     `json:"status"`
	DecidedBy    *string    `json:"decided_by"`
	DeciderName  *string    `json:"decider_name"`
	DecidedAt    *time.Time `json:"decided_at"`
	Reason       *string    `json:"reason"`
	CreatedAt    time.Time  `json:"created_at"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const instanceColumns = `i.id, i.tenant_id, i.document_type, i.document_id,
	COALESCE(i.document_label, '') AS document_label,
	COALESCE(i.amount_minor, 0) AS amount_minor,
	i.status, i.requester_id, i.created_at,
	COALESCE(u.full_name, '') AS requester_name`

func scanInstance(row interface{ Scan(...any) error }) (*Instance, error) {
	var inst Instance
	err := row.Scan(&inst.ID, &inst.TenantID, &inst.DocumentType, &inst.DocumentID,
		&inst.DocumentLabel, &inst.AmountMinor, &inst.Status, &inst.RequesterID,
		&inst.CreatedAt, &inst.RequesterName)
	if err != nil {
		return nil, err
	}
	inst.Steps = make([]Step, 0)
	return &inst, nil
}

// CreateInstance inserts an approval instance with one step per applicable rule,
// then re-reads the full record via GetInstance (includes requester name join).
func (r *Repository) CreateInstance(ctx context.Context, tenantID, docType, docID, label string, amount int64, requesterID string, rules []Rule) (*Instance, error) {
	var createdID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var (
			outTenantID, outDocType, outDocID, outLabel string
			outAmount                                   int64
			outStatus, outRequesterID                   string
			outCreatedAt                                time.Time
		)
		row := tx.QueryRow(ctx, `
			INSERT INTO approval_instances (
				tenant_id, document_type, document_id, document_label, amount_minor, status, requester_id
			) VALUES ($1, $2, $3, $4, $5, 'pending', $6)
			RETURNING id, tenant_id, document_type, document_id, document_label,
			          amount_minor, status, requester_id, created_at`,
			tenantID, docType, docID, label, amount, requesterID)
		if err := row.Scan(&createdID, &outTenantID, &outDocType, &outDocID, &outLabel,
			&outAmount, &outStatus, &outRequesterID, &outCreatedAt); err != nil {
			return fmt.Errorf("insert approval instance: %w", err)
		}
		for _, rule := range rules {
			if _, err := tx.Exec(ctx, `
				INSERT INTO approval_steps (tenant_id, instance_id, level, approver_role)
				VALUES ($1, $2, $3, $4)`,
				tenantID, createdID, rule.Level, rule.ApproverRole); err != nil {
				return fmt.Errorf("insert approval step: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	// createdID guaranteed non-empty here (successful INSERT returned id).
	return r.GetInstance(ctx, tenantID, createdID)
}

// PendingInstances returns all pending instances with steps, robust to nullable columns.
func (r *Repository) PendingInstances(ctx context.Context, tenantID string) ([]Instance, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+instanceColumns+`
		FROM approval_instances i
		LEFT JOIN users u ON u.id = i.requester_id
		WHERE i.tenant_id = $1 AND i.status = 'pending'
		ORDER BY i.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query pending instances: %w", err)
	}
	defer rows.Close()
	list := make([]Instance, 0)
	ids := make([]string, 0)
	for rows.Next() {
		inst, err := scanInstance(rows)
		if err != nil {
			return nil, fmt.Errorf("scan instance: %w", err)
		}
		list = append(list, *inst)
		ids = append(ids, inst.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return list, nil
	}
	stepsByInst, err := r.stepsFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Steps = stepsByInst[list[i].ID]
	}
	return list, nil
}

// GetInstance returns one instance with steps (status derived from decision).
func (r *Repository) GetInstance(ctx context.Context, tenantID, id string) (*Instance, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+instanceColumns+`
		FROM approval_instances i
		LEFT JOIN users u ON u.id = i.requester_id
		WHERE i.id = $1 AND i.tenant_id = $2`, id, tenantID)
	inst, err := scanInstance(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query instance: %w", err)
	}
	steps, err := r.stepsFor(ctx, tenantID, []string{inst.ID})
	if err != nil {
		return nil, err
	}
	inst.Steps = steps[inst.ID]
	return inst, nil
}

// GetInstanceByDocument returns the instance bound to a document (nil if none).
func (r *Repository) GetInstanceByDocument(ctx context.Context, tenantID, docType, docID string) (*Instance, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+instanceColumns+`
		FROM approval_instances i
		LEFT JOIN users u ON u.id = i.requester_id
		WHERE i.tenant_id = $1 AND i.document_type = $2 AND i.document_id = $3`, tenantID, docType, docID)
	inst, err := scanInstance(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query instance by document: %w", err)
	}
	steps, err := r.stepsFor(ctx, tenantID, []string{inst.ID})
	if err != nil {
		return nil, err
	}
	inst.Steps = steps[inst.ID]
	return inst, nil
}

// Decide records a step decision and finalizes the instance when settled.
func (r *Repository) Decide(ctx context.Context, tenantID, stepID, decision, reason, actorID string) (*Instance, error) {
	var instanceID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var (
			instID          string
			level           int
			currentDecision *string
		)
		err := tx.QueryRow(ctx, `
			SELECT instance_id, level, decision FROM approval_steps
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, stepID, tenantID).Scan(&instID, &level, &currentDecision)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock step: %w", err)
		}
		if currentDecision != nil {
			return ErrAlreadyDecided
		}
		instanceID = instID

		var reasonArg *string
		if reason != "" {
			reasonArg = &reason
		}
		if _, err := tx.Exec(ctx, `
			UPDATE approval_steps
			SET decision = $1, decided_by = $2, decided_at = now(), reason = $3
			WHERE id = $4 AND tenant_id = $5`,
			decision, actorID, reasonArg, stepID, tenantID); err != nil {
			return fmt.Errorf("update step: %w", err)
		}

		var pending, rejected int
		if err := tx.QueryRow(ctx, `
			SELECT COUNT(*) FILTER (WHERE decision IS NULL),
			       COUNT(*) FILTER (WHERE decision = 'rejected')
			FROM approval_steps
			WHERE tenant_id = $1 AND instance_id = $2`, tenantID, instID).Scan(&pending, &rejected); err != nil {
			return fmt.Errorf("aggregate steps: %w", err)
		}

		newStatus := "pending"
		if rejected > 0 {
			newStatus = "rejected"
		} else if pending == 0 {
			newStatus = "approved"
		}

		if newStatus != "pending" {
			if _, err := tx.Exec(ctx, `
				UPDATE approval_instances
				SET status = $1, decided_at = now(), decided_by = $2, updated_at = now()
				WHERE id = $3 AND tenant_id = $4`,
				newStatus, actorID, instID, tenantID); err != nil {
				return fmt.Errorf("finalize instance: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetInstance(ctx, tenantID, instanceID)
}

// RulesFor returns active rules for a document type ordered by level.
func (r *Repository) RulesFor(ctx context.Context, tenantID, docType string) ([]Rule, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, document_type, name, threshold_minor, approver_role, level, active
		FROM approval_rules
		WHERE tenant_id = $1 AND document_type = $2 AND active
		ORDER BY level`, tenantID, docType)
	if err != nil {
		return nil, fmt.Errorf("query rules: %w", err)
	}
	defer rows.Close()
	out := make([]Rule, 0)
	for rows.Next() {
		var rule Rule
		if err := rows.Scan(&rule.ID, &rule.DocumentType, &rule.Name, &rule.ThresholdMinor,
			&rule.ApproverRole, &rule.Level, &rule.Active); err != nil {
			return nil, fmt.Errorf("scan rule: %w", err)
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

// stepsFor loads steps and derives Status from Decision (nil → pending).
func (r *Repository) stepsFor(ctx context.Context, tenantID string, instanceIDs []string) (map[string][]Step, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT s.id, s.instance_id, s.level, s.approver_role, s.decision,
		       s.decided_by, COALESCE(u.full_name, '') AS decider_name,
		       s.decided_at, s.reason, s.created_at
		FROM approval_steps s
		LEFT JOIN users u ON u.id = s.decided_by
		WHERE s.tenant_id = $1 AND s.instance_id = ANY($2)
		ORDER BY s.level`, tenantID, instanceIDs)
	if err != nil {
		return nil, fmt.Errorf("query steps: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]Step)
	for rows.Next() {
		var st Step
		if err := rows.Scan(&st.ID, &st.InstanceID, &st.Level, &st.ApproverRole, &st.Decision,
			&st.DecidedBy, &st.DeciderName, &st.DecidedAt, &st.Reason, &st.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan step: %w", err)
		}
		if st.Decision == nil {
			st.Status = "pending"
		} else {
			st.Status = *st.Decision
		}
		out[st.InstanceID] = append(out[st.InstanceID], st)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

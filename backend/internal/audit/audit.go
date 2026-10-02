package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Log struct {
	ID          int64           `json:"id"`
	TenantID    string          `json:"tenant_id"`
	ActorUserID *string         `json:"actor_user_id"`
	EventType   string          `json:"event_type"`
	EntityType  string          `json:"entity_type"`
	EntityID    string          `json:"entity_id"`
	OldData     json.RawMessage `json:"old_data"`
	NewData     json.RawMessage `json:"new_data"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"created_at"`
}

type ListFilter struct {
	EntityType string
	EntityID   string
	ActorID    string
	EventType  string
	Limit      int
	Offset     int
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, tenantID string, f ListFilter) ([]Log, error) {
	query := `
		SELECT id, tenant_id, actor_user_id, event_type, entity_type, entity_id,
		       COALESCE(old_data::text, 'null'), COALESCE(new_data::text, 'null'),
		       COALESCE(metadata::text, 'null'), created_at
		FROM audit_logs
		WHERE tenant_id = $1`
	args := []any{tenantID}
	argIdx := 2

	if f.EntityType != "" {
		query += fmt.Sprintf(" AND entity_type = $%d", argIdx)
		args = append(args, f.EntityType)
		argIdx++
	}
	if f.EntityID != "" {
		query += fmt.Sprintf(" AND entity_id = $%d", argIdx)
		args = append(args, f.EntityID)
		argIdx++
	}
	if f.ActorID != "" {
		query += fmt.Sprintf(" AND actor_user_id = $%d", argIdx)
		args = append(args, f.ActorID)
		argIdx++
	}
	if f.EventType != "" {
		query += fmt.Sprintf(" AND event_type = $%d", argIdx)
		args = append(args, f.EventType)
		argIdx++
	}

	query += " ORDER BY created_at DESC"

	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	query += fmt.Sprintf(" LIMIT $%d", argIdx)
	args = append(args, limit)
	argIdx++

	if f.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIdx)
		args = append(args, f.Offset)
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query audit logs: %w", err)
	}
	defer rows.Close()

	out := []Log{}
	for rows.Next() {
		var log Log
		var oldStr, newStr, metaStr string
		if err := rows.Scan(&log.ID, &log.TenantID, &log.ActorUserID, &log.EventType,
			&log.EntityType, &log.EntityID, &oldStr, &newStr, &metaStr, &log.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		log.OldData = json.RawMessage(oldStr)
		log.NewData = json.RawMessage(newStr)
		log.Metadata = json.RawMessage(metaStr)
		out = append(out, log)
	}
	return out, rows.Err()
}

func (r *Repository) Count(ctx context.Context, tenantID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`, tenantID).Scan(&count)
	return count, err
}

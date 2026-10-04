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
	From       *time.Time
	To         *time.Time
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
	idx := 2

	if f.EntityType != "" {
		query += fmt.Sprintf(" AND entity_type = $%d", idx)
		args = append(args, f.EntityType)
		idx++
	}
	if f.EntityID != "" {
		query += fmt.Sprintf(" AND entity_id = $%d", idx)
		args = append(args, f.EntityID)
		idx++
	}
	if f.ActorID != "" {
		query += fmt.Sprintf(" AND actor_user_id = $%d", idx)
		args = append(args, f.ActorID)
		idx++
	}
	if f.EventType != "" {
		query += fmt.Sprintf(" AND event_type = $%d", idx)
		args = append(args, f.EventType)
		idx++
	}
	if f.From != nil {
		query += fmt.Sprintf(" AND created_at >= $%d", idx)
		args = append(args, *f.From)
		idx++
	}
	if f.To != nil {
		query += fmt.Sprintf(" AND created_at <= $%d", idx)
		args = append(args, *f.To)
		idx++
	}

	query += " ORDER BY created_at DESC"

	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	query += fmt.Sprintf(" LIMIT $%d", idx)
	args = append(args, limit)
	idx++
	if f.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", idx)
		args = append(args, f.Offset)
	}

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query audit logs: %w", err)
	}
	defer rows.Close()

	out := []Log{}
	for rows.Next() {
		var l Log
		var oldStr, newStr, metaStr string
		if err := rows.Scan(&l.ID, &l.TenantID, &l.ActorUserID, &l.EventType, &l.EntityType,
			&l.EntityID, &oldStr, &newStr, &metaStr, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		l.OldData = json.RawMessage(oldStr)
		l.NewData = json.RawMessage(newStr)
		l.Metadata = json.RawMessage(metaStr)
		out = append(out, l)
	}
	return out, rows.Err()
}

func (r *Repository) Count(ctx context.Context, tenantID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1`, tenantID).Scan(&count)
	return count, err
}

// Export retrieves audit logs within a date range for CSV/JSON export.
// Limit default 10_000 rows untuk mencegah OOM di production.
func (r *Repository) Export(ctx context.Context, tenantID string, from, to time.Time, limit int) ([]Log, error) {
	if limit <= 0 || limit > 50000 {
		limit = 10000
	}
	query := `
		SELECT id, tenant_id, actor_user_id, event_type, entity_type, entity_id,
		       COALESCE(old_data::text, 'null'), COALESCE(new_data::text, 'null'),
		       COALESCE(metadata::text, 'null'), created_at
		FROM audit_logs
		WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
		ORDER BY created_at DESC
		LIMIT $4`
	rows, err := r.pool.Query(ctx, query, tenantID, from, to, limit)
	if err != nil {
		return nil, fmt.Errorf("export audit logs: %w", err)
	}
	defer rows.Close()
	out := []Log{}
	for rows.Next() {
		var l Log
		var oldStr, newStr, metaStr string
		if err := rows.Scan(&l.ID, &l.TenantID, &l.ActorUserID, &l.EventType, &l.EntityType,
			&l.EntityID, &oldStr, &newStr, &metaStr, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit log: %w", err)
		}
		l.OldData = json.RawMessage(oldStr)
		l.NewData = json.RawMessage(newStr)
		l.Metadata = json.RawMessage(metaStr)
		out = append(out, l)
	}
	return out, rows.Err()
}

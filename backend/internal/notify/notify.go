package notify

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Notification struct {
	ID         string     `json:"id"`
	Kind       string     `json:"kind"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	EntityType *string    `json:"entity_type"`
	EntityID   *string    `json:"entity_id"`
	ReadAt     *time.Time `json:"read_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

type Service struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// UsersWithRole returns user ids holding the given role in the tenant.
func (s *Service) UsersWithRole(ctx context.Context, tenantID, role string) []string {
	rows, err := s.pool.Query(ctx, `
		SELECT user_id FROM user_roles
		WHERE tenant_id = $1 AND role = $2`, tenantID, role)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// Emit inserts notifications best-effort; failures never break the caller.
func (s *Service) Emit(ctx context.Context, tenantID string, userIDs []string, kind, title, body, entityType, entityID string) {
	for _, uid := range userIDs {
		_, _ = s.pool.Exec(ctx, `
			INSERT INTO notifications (tenant_id, user_id, kind, title, body, entity_type, entity_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			tenantID, uid, kind, title, body, entityType, parseUUID(entityID))
	}
}

func parseUUID(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// List returns the latest notifications for one user, unread first.
func (s *Service) List(ctx context.Context, tenantID, userID string, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 50 {
		limit = 30
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, kind, title, body, entity_type, entity_id, read_at, created_at
		FROM notifications
		WHERE tenant_id = $1 AND user_id = $2
		ORDER BY (read_at IS NULL) DESC, created_at DESC
		LIMIT $3`, tenantID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Notification, 0)
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.EntityType, &n.EntityID, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// UnreadCount returns the pending notification count for one user.
func (s *Service) UnreadCount(ctx context.Context, tenantID, userID string) int64 {
	var count int64
	_ = s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM notifications
		WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`, tenantID, userID).Scan(&count)
	return count
}

// MarkRead flags one notification as read.
func (s *Service) MarkRead(ctx context.Context, tenantID, userID, id string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE notifications SET read_at = now()
		WHERE id = $1 AND tenant_id = $2 AND user_id = $3`, id, tenantID, userID)
	return err
}

// MarkAll flags every notification of the user as read.
func (s *Service) MarkAll(ctx context.Context, tenantID, userID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE notifications SET read_at = now()
		WHERE tenant_id = $1 AND user_id = $2 AND read_at IS NULL`, tenantID, userID)
	return err
}

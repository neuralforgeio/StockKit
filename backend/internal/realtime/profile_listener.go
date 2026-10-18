package realtime

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StartProfileListener LISTENs on 'user_profile_events' (fed by the DB trigger
// on users UPDATE) and forwards identity changes to tenant WebSocket clients
// as kind=profile_updated. Push-based: zero polling, works for ANY write path.
func StartProfileListener(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger, broadcast func(tenantID string, payload map[string]any)) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
				if err := profileListenLoop(ctx, pool, logger, broadcast); err != nil {
					if ctx.Err() != nil {
						return
					}
					if strings.Contains(err.Error(), "closed pool") || strings.Contains(err.Error(), "conn closed") {
						logger.Info("profile listener stopped: database pool closed (shutdown)")
						return
					}
					logger.Error("profile listener error, reconnecting in 3s", "error", err)
					select {
					case <-ctx.Done():
						return
					case <-time.After(3 * time.Second):
					}
				}
			}
		}
	}()
}

func profileListenLoop(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger, broadcast func(string, map[string]any)) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire listener conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN user_profile_events"); err != nil {
		return fmt.Errorf("LISTEN user_profile_events: %w", err)
	}
	logger.Info("profile listener started", "channel", "user_profile_events")

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return fmt.Errorf("wait notification: %w", err)
		}
		if notification.Channel != "user_profile_events" {
			continue
		}
		var ev struct {
			UserID   string `json:"user_id"`
			TenantID string `json:"tenant_id"`
			FullName string `json:"full_name"`
			Email    string `json:"email"`
			Status   string `json:"status"`
		}
		if err := json.Unmarshal([]byte(notification.Payload), &ev); err != nil {
			logger.Warn("profile listener unmarshal", "error", err, "payload", notification.Payload)
			continue
		}
		broadcast(ev.TenantID, map[string]any{
			"user_id":   ev.UserID,
			"full_name": ev.FullName,
			"email":     ev.Email,
			"status":    ev.Status,
		})
	}
}

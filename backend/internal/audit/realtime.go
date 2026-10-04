package audit

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Hub manages WebSocket connections for real-time audit notifications.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]map[*websocket.Conn]bool // tenantID -> connections
	logger  *slog.Logger
}

// NewHub creates a new audit notification hub.
func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients: make(map[string]map[*websocket.Conn]bool),
		logger:  logger,
	}
}

// Register adds a WebSocket connection to the hub for a specific tenant.
func (h *Hub) Register(tenantID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[tenantID] == nil {
		h.clients[tenantID] = make(map[*websocket.Conn]bool)
	}
	h.clients[tenantID][conn] = true
	h.logger.Info("audit ws registered", "tenant_id", tenantID, "total", len(h.clients[tenantID]))
}

// Unregister removes a WebSocket connection from the hub.
func (h *Hub) Unregister(tenantID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.clients[tenantID]; ok {
		delete(conns, conn)
		conn.Close()
		if len(conns) == 0 {
			delete(h.clients, tenantID)
		}
		h.logger.Info("audit ws unregistered", "tenant_id", tenantID)
	}
}

// Broadcast sends a message to all connections for a specific tenant.
func (h *Hub) Broadcast(tenantID string, message any) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	conns, ok := h.clients[tenantID]
	if !ok || len(conns) == 0 {
		return
	}
	data, err := json.Marshal(message)
	if err != nil {
		h.logger.Error("audit ws marshal", "error", err)
		return
	}
	for conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			h.logger.Warn("audit ws write failed", "error", err)
			conn.Close()
			delete(conns, conn)
		}
	}
}

// StartListener starts a long-running goroutine that LISTENs on the
// 'audit_events' PostgreSQL channel and broadcasts incoming events to
// the appropriate tenant's WebSocket clients. The goroutine runs until
// ctx is canceled and automatically reconnects on DB errors.
func StartListener(ctx context.Context, pool *pgxpool.Pool, hub *Hub, logger *slog.Logger) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				logger.Info("audit listener shutting down")
				return
			default:
				if err := listenLoop(ctx, pool, hub, logger); err != nil {
					if ctx.Err() != nil {
						return
					}
					logger.Error("audit listener error, reconnecting in 3s", "error", err)
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

func listenLoop(ctx context.Context, pool *pgxpool.Pool, hub *Hub, logger *slog.Logger) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire listener conn: %w", err)
	}
	defer conn.Release()

	if _, err := conn.Exec(ctx, "LISTEN audit_events"); err != nil {
		return fmt.Errorf("LISTEN audit_events: %w", err)
	}
	logger.Info("audit listener started", "channel", "audit_events")

	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return fmt.Errorf("wait notification: %w", err)
		}
		if notification.Channel != "audit_events" {
			continue
		}

		var event struct {
			ID          int64     `json:"id"`
			TenantID    string    `json:"tenant_id"`
			ActorUserID *string   `json:"actor_user_id"`
			EventType   string    `json:"event_type"`
			EntityType  string    `json:"entity_type"`
			EntityID    string    `json:"entity_id"`
			CreatedAt   time.Time `json:"created_at"`
		}
		if err := json.Unmarshal([]byte(notification.Payload), &event); err != nil {
			logger.Warn("audit listener unmarshal", "error", err, "payload", notification.Payload)
			continue
		}

		hub.Broadcast(event.TenantID, map[string]any{
			"type":          "audit_event",
			"id":            event.ID,
			"event_type":    event.EventType,
			"entity_type":   event.EntityType,
			"entity_id":     event.EntityID,
			"actor_user_id": event.ActorUserID,
			"created_at":    event.CreatedAt.Format(time.RFC3339),
		})
	}
}

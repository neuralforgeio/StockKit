package realtime

import (
	"context"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Event is pushed to connected clients over WebSocket.
type Event struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	DocType   string `json:"doc_type,omitempty"`
	DocID     string `json:"doc_id,omitempty"`
	CreatedAt string `json:"created_at"`
}

type Sink struct{ Ch chan Event }

type Hub struct {
	pool *pgxpool.Pool

	mu    sync.RWMutex
	conns map[string]map[*Sink]bool

	// last is only touched by the single Run goroutine.
	last time.Time

	errMu    sync.Mutex
	errCount int
}

func NewHub(pool *pgxpool.Pool) *Hub {
	return &Hub{
		pool:  pool,
		conns: make(map[string]map[*Sink]bool),
		last:  time.Now(),
	}
}

func key(tenantID, userID string) string { return tenantID + "|" + userID }

func (h *Hub) Attach(tenantID, userID string) *Sink {
	s := &Sink{Ch: make(chan Event, 64)}
	h.mu.Lock()
	m, ok := h.conns[key(tenantID, userID)]
	if !ok {
		m = make(map[*Sink]bool)
		h.conns[key(tenantID, userID)] = m
	}
	m[s] = true
	h.mu.Unlock()
	return s
}

func (h *Hub) Detach(tenantID, userID string, s *Sink) {
	h.mu.Lock()
	if m, ok := h.conns[key(tenantID, userID)]; ok {
		delete(m, s)
		if len(m) == 0 {
			delete(h.conns, key(tenantID, userID))
		}
	}
	h.mu.Unlock()
	close(s.Ch)
}

func (h *Hub) publish(tenantID, userID string, ev Event) {
	h.mu.RLock()
	for s := range h.conns[key(tenantID, userID)] {
		select {
		case s.Ch <- ev:
		default: // drop if slow consumer
		}
	}
	h.mu.RUnlock()
}

const (
	baseInterval = 2 * time.Second
	maxInterval  = 30 * time.Second
)

// Run polls the notifications table and pushes new events to connected clients.
// On DB error it backs off exponentially and logs once per error streak.
func (h *Hub) Run(ctx context.Context) {
	interval := baseInterval
	timer := time.NewTimer(interval)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			interval = h.poll(ctx, interval)
			timer.Reset(interval)
		}
	}
}

// poll returns the next poll interval (backoff on error, reset on success).
func (h *Hub) poll(ctx context.Context, cur time.Duration) time.Duration {
	// Only select columns that are guaranteed to exist in the notifications
	// table (id, tenant_id, user_id, kind, title, body, created_at).
	rows, err := h.pool.Query(ctx, `
		SELECT id, tenant_id, user_id, kind, title, body, created_at
		FROM notifications
		WHERE created_at > $1
		ORDER BY created_at ASC`, h.last)
	if err != nil {
		return h.onErr(err, cur)
	}
	defer rows.Close()

	for rows.Next() {
		var ev Event
		var tenantID, userID string
		var createdAt time.Time
		if err := rows.Scan(&ev.ID, &tenantID, &userID, &ev.Kind, &ev.Title, &ev.Body, &createdAt); err != nil {
			continue
		}
		ev.CreatedAt = createdAt.Format(time.RFC3339)
		h.publish(tenantID, userID, ev)
		if createdAt.After(h.last) {
			h.last = createdAt
		}
	}

	h.onOK()
	return baseInterval
}

// BroadcastTenant pushes an event to ALL connected clients of a tenant.
// Used for tenant-wide streams (e.g. audit events) over the single
// shared WebSocket connection per user.
func (h *Hub) BroadcastTenant(tenantID string, ev Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	prefix := tenantID + "|"
	for key, conns := range h.conns {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		for s := range conns {
			select {
			case s.Ch <- ev:
			default: // drop if slow consumer
			}
		}
	}
}

// onErr applies exponential backoff and logs only the first failure of a streak.
func (h *Hub) onErr(err error, cur time.Duration) time.Duration {
	h.errMu.Lock()
	defer h.errMu.Unlock()
	h.errCount++
	if h.errCount == 1 {
		slog.Error("realtime poll failed; backing off", "error", err)
	}
	next := cur * 2
	if next > maxInterval {
		next = maxInterval
	}
	return next
}

// onOK resets the error streak and logs recovery once.
func (h *Hub) onOK() {
	h.errMu.Lock()
	if h.errCount > 0 {
		slog.Info("realtime poll recovered")
	}
	h.errCount = 0
	h.errMu.Unlock()
}

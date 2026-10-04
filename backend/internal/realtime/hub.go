package realtime

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Event struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	DocType   string `json:"doc_type"`
	DocID     string `json:"doc_id"`
	CreatedAt string `json:"created_at"`
}

type Sink struct{ Ch chan Event }

type Hub struct {
	pool  *pgxpool.Pool
	mu    sync.RWMutex
	conns map[string]map[*Sink]bool
	last  time.Time
}

func NewHub(pool *pgxpool.Pool) *Hub {
	return &Hub{pool: pool, conns: make(map[string]map[*Sink]bool), last: time.Now()}
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
		default:
		}
	}
	h.mu.RUnlock()
}

// Run polls the notifications table every 2s and pushes new events to connected clients.
func (h *Hub) Run(ctx context.Context) {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			h.poll(ctx, now)
		}
	}
}

func (h *Hub) poll(ctx context.Context, now time.Time) {
	rows, err := h.pool.Query(ctx, `
		SELECT id, tenant_id, user_id, kind, title, body, doc_type, doc_id, created_at
		FROM notifications
		WHERE created_at > $1
		ORDER BY created_at ASC`, h.last)
	if err != nil {
		slog.Error("realtime poll failed", "error", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var ev Event
		var tenantID, userID string
		var docType, docID *string
		var createdAt time.Time
		if err := rows.Scan(&ev.ID, &tenantID, &userID, &ev.Kind, &ev.Title, &ev.Body, &docType, &docID, &createdAt); err != nil {
			continue
		}
		if docType != nil {
			ev.DocType = *docType
		}
		if docID != nil {
			ev.DocID = *docID
		}
		ev.CreatedAt = createdAt.Format(time.RFC3339)
		h.publish(tenantID, userID, ev)
		if createdAt.After(h.last) {
			h.last = createdAt
		}
	}
	h.last = now
}
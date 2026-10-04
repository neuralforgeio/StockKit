package audit

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/gorilla/websocket"
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

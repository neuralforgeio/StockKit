package handlers

import (
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/neuralforgeio/StockKit/internal/audit"
	mw "github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // allow all origins in dev; tighten in production
	},
}

// AuditWS handles WebSocket connections for real-time audit notifications.
type AuditWS struct {
	hub *audit.Hub
}

// NewAuditWS creates a new audit WebSocket handler.
func NewAuditWS(hub *audit.Hub) *AuditWS {
	return &AuditWS{hub: hub}
}

// ServeWS upgrades HTTP to WebSocket and registers the connection.
func (h *AuditWS) ServeWS(w http.ResponseWriter, r *http.Request) {
	claims := mw.GetClaims(r)
	if claims == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "WebSocket upgrade failed", http.StatusInternalServerError)
		return
	}

	h.hub.Register(claims.TenantID, conn)
	defer h.hub.Unregister(claims.TenantID, conn)

	// Keep connection alive and handle client disconnect
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

package handlers

import (
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/neuralforgeio/StockKit/internal/audit"
	mw "github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
)

// auditUpgrader is a dedicated WebSocket upgrader for the audit realtime
// endpoint. Renamed to avoid redeclaration conflict with the shared
// `upgrader` declared in notification_ws.go (same package).
var auditUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
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

	conn, err := auditUpgrader.Upgrade(w, r, nil)
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

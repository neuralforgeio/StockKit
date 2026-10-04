package handlers

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/neuralforgeio/StockKit/internal/realtime"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type NotificationsWS struct {
	hub *realtime.Hub
}

func NewNotificationsWS(hub *realtime.Hub) *NotificationsWS {
	return &NotificationsWS{hub: hub}
}

// ServeWS upgrades to WebSocket and streams realtime notification events.
func (h *NotificationsWS) ServeWS(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		http.Error(w, `{"code":"AUTH_FAILED","message":"Missing claims"}`, http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sink := h.hub.Attach(claims.TenantID, claims.Subject)
	defer h.hub.Detach(claims.TenantID, claims.Subject, sink)

	// writer: push events to client
	go func() {
		for ev := range sink.Ch {
			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteJSON(ev); err != nil {
				conn.Close()
				return
			}
		}
	}()

	// reader: keepalive + detect close
	conn.SetReadLimit(512)
	conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

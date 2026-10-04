package handlers

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
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
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Visible in backend logs instead of a silent 500.
		slog.Warn("websocket upgrade failed", "error", err, "path", r.URL.Path)
		return
	}
	defer conn.Close()

	sink := h.hub.Attach(claims.TenantID, claims.Subject)
	defer h.hub.Detach(claims.TenantID, claims.Subject, sink)

	done := make(chan struct{})
	defer close(done)

	// Writer: push hub events to the client.
	go func() {
		for {
			select {
			case ev, open := <-sink.Ch:
				if !open {
					return
				}
				conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
				if err := conn.WriteJSON(ev); err != nil {
					conn.Close()
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Pinger: WriteControl is safe to call concurrently with the writer goroutine.
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-t.C:
				deadline := time.Now().Add(5 * time.Second)
				if err := conn.WriteControl(websocket.PingMessage, nil, deadline); err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Reader: keepalive bookkeeping + close detection.
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

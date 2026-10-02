package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/notify"
)

type Notifications struct {
	svc *notify.Service
}

func NewNotifications(svc *notify.Service) *Notifications {
	return &Notifications{svc: svc}
}

// List handles GET /api/v1/notifications.
func (h *Notifications) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.List(r.Context(), claims.TenantID, claims.Subject, 30)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// UnreadCount handles GET /api/v1/notifications/unread-count.
func (h *Notifications) UnreadCount(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	count := h.svc.UnreadCount(r.Context(), claims.TenantID, claims.Subject)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]int64{"count": count}})
}

// MarkRead handles POST /api/v1/notifications/{id}/read.
func (h *Notifications) MarkRead(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.MarkRead(r.Context(), claims.TenantID, claims.Subject, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "read"})
}

// MarkAll handles POST /api/v1/notifications/read-all.
func (h *Notifications) MarkAll(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.MarkAll(r.Context(), claims.TenantID, claims.Subject); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "read"})
}

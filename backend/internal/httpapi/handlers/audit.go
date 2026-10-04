package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/neuralforgeio/StockKit/internal/audit"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Audit struct {
	repo *audit.Repository
}

func NewAudit(repo *audit.Repository) *Audit { return &Audit{repo: repo} }

func (h *Audit) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	filter := audit.ListFilter{
		EntityType: r.URL.Query().Get("entity_type"),
		EntityID:   r.URL.Query().Get("entity_id"),
		ActorID:    r.URL.Query().Get("actor_id"),
		EventType:  r.URL.Query().Get("event_type"),
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.From = &t
		} else if t, err := time.Parse("2006-01-02", v); err == nil {
			filter.From = &t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			filter.To = &t
		} else if t, err := time.Parse("2006-01-02", v); err == nil {
			end := t.Add(24*time.Hour - time.Second)
			filter.To = &end
		}
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil {
			filter.Limit = n
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil {
			filter.Offset = n
		}
	}

	logs, err := h.repo.List(r.Context(), claims.TenantID, filter)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	total, _ := h.repo.Count(r.Context(), claims.TenantID)

	writeJSON(w, http.StatusOK, map[string]any{
		"data": logs,
		"pagination": map[string]any{
			"total":  total,
			"limit":  filter.Limit,
			"offset": filter.Offset,
		},
	})
}

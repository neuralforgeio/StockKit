package handlers

import (
	"net/http"
	"strconv"

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

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = l
		}
	}
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = o
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

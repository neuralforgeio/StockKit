package handlers

import (
	"encoding/csv"
	"fmt"
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

// Export handles GET /api/v1/audit-logs/export?format=csv|json&from=2026-01-01&to=2026-12-31
func (h *Audit) Export(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}
	fromStr := r.URL.Query().Get("from")
	toStr := r.URL.Query().Get("to")

	from := time.Now().AddDate(0, -1, 0)
	to := time.Now()
	if fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			from = t
		}
	}
	if toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			to = t.Add(24*time.Hour - time.Second)
		}
	}

	logs, err := h.repo.Export(r.Context(), claims.TenantID, from, to, 10000)
	if err != nil {
		httperr.Write(w, httperr.Wrap("EXPORT_FAILED", http.StatusInternalServerError, "Failed to export audit logs", err))
		return
	}

	switch format {
	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=audit-logs.json")
		writeJSON(w, http.StatusOK, map[string]any{"data": logs})
	default:
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=audit-logs-%s.csv", time.Now().Format("20060102")))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"id", "created_at", "event_type", "entity_type", "entity_id", "old_data", "new_data", "metadata"})
		for _, l := range logs {
			_ = cw.Write([]string{
				fmt.Sprintf("%d", l.ID),
				l.CreatedAt.Format(time.RFC3339),
				l.EventType,
				l.EntityType,
				l.EntityID,
				string(l.OldData),
				string(l.NewData),
				string(l.Metadata),
			})
		}
		cw.Flush()
	}
}

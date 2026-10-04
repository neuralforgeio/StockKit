package handlers

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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

// Export handles GET /api/v1/audit-logs/export
// Query: format=csv|csv-flat|json, from=YYYY-MM-DD, to=YYYY-MM-DD, include_system=true
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
	includeSystem := r.URL.Query().Get("include_system") == "true"

	from := time.Now().AddDate(0, -1, 0)
	to := time.Now()
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			from = t
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse("2006-01-02", v); err == nil {
			to = t.Add(24*time.Hour - time.Second)
		}
	}

	rows, err := h.repo.Export(r.Context(), claims.TenantID, from, to, 10000)
	if err != nil {
		httperr.Write(w, httperr.Wrap("EXPORT_FAILED", http.StatusInternalServerError, "Failed to export audit logs", err))
		return
	}

	stamp := time.Now().Format("20060102-150405")

	switch format {
	case "json":
		type jsonRow struct {
			ID             int64               `json:"id"`
			Timestamp      string              `json:"timestamp"`
			EventType      string              `json:"event_type"`
			EntityType     string              `json:"entity_type"`
			EntityID       string              `json:"entity_id"`
			DocumentNumber string              `json:"document_number,omitempty"`
			ActorID        *string             `json:"actor_id"`
			ActorName      *string             `json:"actor_name"`
			ActorEmail     *string             `json:"actor_email"`
			ChangedFields  []audit.FieldChange `json:"changed_fields"`
			OldData        json.RawMessage     `json:"old_data"`
			NewData        json.RawMessage     `json:"new_data"`
		}
		out := make([]jsonRow, 0, len(rows))
		for _, row := range rows {
			out = append(out, jsonRow{
				ID:             row.ID,
				Timestamp:      row.CreatedAt.Format("2006-01-02 15:04:05"),
				EventType:      row.EventType,
				EntityType:     row.EntityType,
				EntityID:       row.EntityID,
				DocumentNumber: audit.DocumentNumber(row.OldData, row.NewData),
				ActorID:        row.ActorUserID,
				ActorName:      row.ActorName,
				ActorEmail:     row.ActorEmail,
				ChangedFields:  audit.Diff(row.OldData, row.NewData, includeSystem),
				OldData:        row.OldData,
				NewData:        row.NewData,
			})
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=audit-logs-%s.json", stamp))
		writeJSON(w, http.StatusOK, map[string]any{"data": out, "count": len(out)})

	case "csv-flat":
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=audit-logs-flat-%s.csv", stamp))
		_ = writeBOM(w)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"No", "Timestamp", "Event", "Entity", "Document", "Entity ID", "Actor", "Field", "Old Value", "New Value"})
		no := 1
		for _, row := range rows {
			ts := row.CreatedAt.Format("2006-01-02 15:04:05")
			doc := audit.DocumentNumber(row.OldData, row.NewData)
			actor := audit.ActorLabel(row.ActorName, row.ActorEmail, row.ActorUserID)
			changes := audit.Diff(row.OldData, row.NewData, includeSystem)
			if len(changes) == 0 {
				_ = cw.Write([]string{strconv.Itoa(no), ts, row.EventType, row.EntityType, doc, row.EntityID, actor, "(no tracked changes)", "", ""})
				no++
				continue
			}
			for _, c := range changes {
				_ = cw.Write([]string{strconv.Itoa(no), ts, row.EventType, row.EntityType, doc, row.EntityID, actor, c.Field, audit.RenderValue(c.Old), audit.RenderValue(c.New)})
				no++
			}
		}
		cw.Flush()

	default: // csv (event per row)
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=audit-logs-%s.csv", stamp))
		_ = writeBOM(w)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"No", "Timestamp", "Event", "Entity", "Document", "Entity ID", "Actor", "Changed Fields", "Changes (old -> new)"})
		for i, row := range rows {
			changes := audit.Diff(row.OldData, row.NewData, includeSystem)
			fields := make([]string, 0, len(changes))
			pairs := make([]string, 0, len(changes))
			for _, c := range changes {
				fields = append(fields, c.Field)
				pairs = append(pairs, fmt.Sprintf("%s: %s -> %s", c.Field, truncateCell(audit.RenderValue(c.Old), 80), truncateCell(audit.RenderValue(c.New), 80)))
			}
			summary := strings.Join(pairs, "; ")
			if len(summary) > 800 {
				summary = summary[:797] + "..."
			}
			if len(changes) == 0 {
				summary = "(no tracked changes)"
			}
			_ = cw.Write([]string{
				strconv.Itoa(i + 1),
				row.CreatedAt.Format("2006-01-02 15:04:05"),
				row.EventType,
				row.EntityType,
				audit.DocumentNumber(row.OldData, row.NewData),
				row.EntityID,
				audit.ActorLabel(row.ActorName, row.ActorEmail, row.ActorUserID),
				strings.Join(fields, ", "),
				summary,
			})
		}
		cw.Flush()
	}
}

// writeBOM writes UTF-8 BOM so Excel renders accents/emoji correctly.
func writeBOM(w http.ResponseWriter) error {
	_, err := w.Write([]byte{0xEF, 0xBB, 0xBF})
	return err
}

func truncateCell(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-3] + "..."
}

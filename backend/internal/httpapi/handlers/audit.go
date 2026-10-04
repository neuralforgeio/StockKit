package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

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

// renderCell makes values human-readable inside Excel cells.
func renderCell(v any) string {
	s := audit.RenderValue(v)
	if s == "" {
		return "(empty)"
	}
	return s
}

// Export handles GET /api/v1/audit-logs/export?format=xlsx|json&from=&to=&include_system=true
// Default format=xlsx: ONE workbook with a styled "Events" table (one row per
// event) plus a "Field Changes" sheet (one row per changed field) for pivoting.
func (h *Audit) Export(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	format := r.URL.Query().Get("format")
	if format == "" {
		format = "xlsx"
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

	// ---------- JSON (machine-readable) ----------
	if format == "json" {
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
		return
	}

	// ---------- XLSX (human-readable, single file) ----------
	f := excelize.NewFile()
	f.SetSheetName("Sheet1", "Events")

	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF", Size: 11},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"1F4E79"}, Pattern: 1},
		Alignment: &excelize.Alignment{Horizontal: "center", Vertical: "center"},
	})
	wrapTop, _ := f.NewStyle(&excelize.Style{
		Alignment: &excelize.Alignment{WrapText: true, Vertical: "top"},
	})
	zebra, _ := f.NewStyle(&excelize.Style{
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"F2F6FC"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "top", WrapText: true},
	})

	// ===== Sheet 1: Events (one row per event, NOT flat) =====
	eventsHeader := []any{"No", "Timestamp", "Event", "Entity", "Document", "Entity ID", "Actor", "Changed Fields", "Changes (old → new)"}
	_ = f.SetSheetRow("Events", "A1", &eventsHeader)
	_ = f.SetCellStyle("Events", "A1", "I1", headerStyle)

	rowIdx := 2
	for i, row := range rows {
		changes := audit.Diff(row.OldData, row.NewData, includeSystem)
		fields := make([]string, 0, len(changes))
		pairs := make([]string, 0, len(changes))
		for _, c := range changes {
			fields = append(fields, c.Field)
			pairs = append(pairs, fmt.Sprintf("%s: %s → %s", c.Field, renderCell(c.Old), renderCell(c.New)))
		}
		summary := "(no tracked changes)"
		if len(pairs) > 0 {
			summary = strings.Join(pairs, "\n") // multi-line cell, wrap text
		}
		vals := []any{
			i + 1,
			row.CreatedAt.Format("2006-01-02 15:04:05"),
			row.EventType,
			row.EntityType,
			audit.DocumentNumber(row.OldData, row.NewData),
			row.EntityID,
			audit.ActorLabel(row.ActorName, row.ActorEmail, row.ActorUserID),
			strings.Join(fields, ", "),
			summary,
		}
		cell, _ := excelize.CoordinatesToCellName(1, rowIdx)
		_ = f.SetSheetRow("Events", cell, &vals)
		if i%2 == 1 {
			_ = f.SetCellStyle("Events", fmt.Sprintf("A%d", rowIdx), fmt.Sprintf("H%d", rowIdx), zebra)
			_ = f.SetCellStyle("Events", fmt.Sprintf("I%d", rowIdx), fmt.Sprintf("I%d", rowIdx), zebra)
		} else {
			_ = f.SetCellStyle("Events", fmt.Sprintf("I%d", rowIdx), fmt.Sprintf("I%d", rowIdx), wrapTop)
		}
		rowIdx++
	}
	for col, wd := range map[string]float64{"A": 5, "B": 20, "C": 9, "D": 18, "E": 12, "F": 38, "G": 30, "H": 32, "I": 70} {
		_ = f.SetColWidth("Events", col, col, wd)
	}
	_ = f.AutoFilter("Events", "A1:I1", nil)
	_ = f.SetPanes("Events", &excelize.Panes{Freeze: true, Split: false, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})

	// ===== Sheet 2: Field Changes (detail per field, untuk pivot/filter) =====
	_, _ = f.NewSheet("Field Changes")
	chHeader := []any{"No", "Timestamp", "Event", "Entity", "Document", "Entity ID", "Actor", "Field", "Old Value", "New Value"}
	_ = f.SetSheetRow("Field Changes", "A1", &chHeader)
	_ = f.SetCellStyle("Field Changes", "A1", "J1", headerStyle)

	n, r2 := 1, 2
	for _, row := range rows {
		ts := row.CreatedAt.Format("2006-01-02 15:04:05")
		doc := audit.DocumentNumber(row.OldData, row.NewData)
		actor := audit.ActorLabel(row.ActorName, row.ActorEmail, row.ActorUserID)
		changes := audit.Diff(row.OldData, row.NewData, includeSystem)
		if len(changes) == 0 {
			vals := []any{n, ts, row.EventType, row.EntityType, doc, row.EntityID, actor, "(no tracked changes)", "", ""}
			cell, _ := excelize.CoordinatesToCellName(1, r2)
			_ = f.SetSheetRow("Field Changes", cell, &vals)
			n, r2 = n+1, r2+1
			continue
		}
		for _, c := range changes {
			vals := []any{n, ts, row.EventType, row.EntityType, doc, row.EntityID, actor, c.Field, renderCell(c.Old), renderCell(c.New)}
			cell, _ := excelize.CoordinatesToCellName(1, r2)
			_ = f.SetSheetRow("Field Changes", cell, &vals)
			n, r2 = n+1, r2+1
		}
	}
	for col, wd := range map[string]float64{"A": 5, "B": 20, "C": 9, "D": 18, "E": 12, "F": 38, "G": 30, "H": 22, "I": 40, "J": 40} {
		_ = f.SetColWidth("Field Changes", col, col, wd)
	}
	_ = f.AutoFilter("Field Changes", "A1:J1", nil)
	_ = f.SetPanes("Field Changes", &excelize.Panes{Freeze: true, Split: false, YSplit: 1, TopLeftCell: "A2", ActivePane: "bottomLeft"})

	f.SetActiveSheet(0)

	var buf bytes.Buffer
	if err := f.Write(&buf); err != nil {
		httperr.Write(w, httperr.Wrap("EXPORT_FAILED", http.StatusInternalServerError, "Failed to render workbook", err))
		return
	}
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=audit-logs-%s.xlsx", stamp))
	_, _ = w.Write(buf.Bytes())
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

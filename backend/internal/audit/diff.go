package audit

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"
)

// FieldChange describes a single changed field between old and new snapshots.
type FieldChange struct {
	Field string `json:"field"`
	Old   any    `json:"old"`
	New   any    `json:"new"`
}

// systemFields are excluded from diffs by default (noise).
var systemFields = map[string]bool{
	"id": true, "tenant_id": true, "created_at": true, "updated_at": true,
}

// Diff computes changed fields between two JSON snapshots.
// INSERT (old=null) yields all new fields; DELETE (new=null) yields all old fields.
func Diff(oldData, newData json.RawMessage, includeSystem bool) []FieldChange {
	oldMap := map[string]any{}
	newMap := map[string]any{}
	_ = json.Unmarshal(oldData, &oldMap)
	_ = json.Unmarshal(newData, &newMap)

	keys := map[string]bool{}
	for k := range oldMap {
		keys[k] = true
	}
	for k := range newMap {
		keys[k] = true
	}
	sorted := make([]string, 0, len(keys))
	for k := range keys {
		if !includeSystem && systemFields[k] {
			continue
		}
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)

	out := []FieldChange{}
	for _, k := range sorted {
		o, okOld := oldMap[k]
		n, okNew := newMap[k]
		switch {
		case !okOld:
			out = append(out, FieldChange{Field: k, Old: nil, New: n})
		case !okNew:
			out = append(out, FieldChange{Field: k, Old: o, New: nil})
		case RenderValue(o) != RenderValue(n):
			out = append(out, FieldChange{Field: k, Old: o, New: n})
		}
	}
	return out
}

// RenderValue renders a JSON scalar for CSV cells (compact, no quotes for strings).
func RenderValue(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case bool:
		return strconv.FormatBool(t)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(strings.Trim(strings.TrimSpace(sprint(t)), "\""), "\n", " "), "\t", " "))
		}
		s := string(b)
		if len(s) > 120 {
			s = s[:117] + "..."
		}
		return s
	}
}

func sprint(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// DocumentNumber extracts a document number (e.g. SO-0006) from snapshots.
func DocumentNumber(oldData, newData json.RawMessage) string {
	for _, raw := range []json.RawMessage{newData, oldData} {
		m := map[string]any{}
		if json.Unmarshal(raw, &m) == nil {
			if n, ok := m["number"].(string); ok && n != "" {
				return n
			}
			if n, ok := m["document_label"].(string); ok && n != "" {
				return n
			}
		}
	}
	return ""
}

// ActorLabel renders a human-readable actor label.
func ActorLabel(name, email, id *string) string {
	if name != nil && *name != "" {
		if email != nil && *email != "" {
			return *name + " <" + *email + ">"
		}
		return *name
	}
	if email != nil && *email != "" {
		return *email
	}
	if id != nil && *id != "" {
		return "user:" + *id
	}
	return "system"
}

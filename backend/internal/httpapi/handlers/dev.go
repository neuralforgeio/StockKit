package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/devutil"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Dev struct {
	pool    *pgxpool.Pool
	logsDir string
	started time.Time
}

func NewDev(pool *pgxpool.Pool, logsDir string) *Dev {
	return &Dev{pool: pool, logsDir: logsDir, started: time.Now()}
}

func (h *Dev) rolesOf(r *http.Request, tenantID, userID string) []string {
	rows, err := h.pool.Query(r.Context(), `
		SELECT ro.name FROM user_roles ur
		JOIN roles ro ON ro.id = ur.role_id AND ro.tenant_id = ur.tenant_id
		WHERE ur.tenant_id = $1 AND ur.user_id = $2`, tenantID, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err == nil {
			out = append(out, n)
		}
	}
	return out
}

func hasRole(roles []string, want string) bool {
	for _, r := range roles {
		if r == want {
			return true
		}
	}
	return false
}

func (h *Dev) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	roles := h.rolesOf(r, claims.TenantID, claims.Subject)
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"roles":        roles,
		"is_developer": hasRole(roles, "developer"),
		"is_owner":     hasRole(roles, "owner"),
	}})
}

func (h *Dev) guard(w http.ResponseWriter, r *http.Request) bool {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return false
	}
	if !hasRole(h.rolesOf(r, claims.TenantID, claims.Subject), "developer") {
		httperr.Write(w, httperr.New("FORBIDDEN", http.StatusForbidden, "Developer role required"))
		return false
	}
	return true
}

func (h *Dev) Metrics(w http.ResponseWriter, r *http.Request) {
	if !h.guard(w, r) {
		return
	}
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	stat := h.pool.Stat()
	logBytes, logFiles := h.logsSize()
	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"goroutines": runtime.NumGoroutine(),
		"heap_alloc_mb": float64(ms.HeapAlloc) / 1048576,
		"heap_sys_mb": float64(ms.HeapSys) / 1048576,
		"gc_cycles": ms.NumGC,
		"uptime_seconds": int64(time.Since(h.started).Seconds()),
		"db_total_conns": stat.TotalConns(),
		"db_idle_conns": stat.IdleConns(),
		"db_acquired": stat.AcquiredConns(),
		"log_files": logFiles,
		"log_bytes": logBytes,
		"go_version": runtime.Version(),
		"go_os": runtime.GOOS,
		"go_arch": runtime.GOARCH,
	}})
}

func (h *Dev) Disk(w http.ResponseWriter, r *http.Request) {
	if !h.guard(w, r) {
		return
	}
	free, total, ok := devutil.DiskUsage(h.logsDir)
	logBytes, logFiles := h.logsSize()
	data := map[string]any{"path": h.logsDir, "log_bytes": logBytes, "log_files": logFiles, "os_ok": ok}
	if ok && total > 0 {
		data["free_bytes"] = free
		data["total_bytes"] = total
		data["used_pct"] = float64(total-free) / float64(total) * 100
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": data})
}

func (h *Dev) Analytics(w http.ResponseWriter, r *http.Request) {
	if !h.guard(w, r) {
		return
	}
	perHour := map[string]int{}
	statusBuckets := map[string]int{"2xx": 0, "4xx": 0, "5xx": 0, "other": 0}
	endpoints := map[string]int{}
	levels := map[string]int{}
	now := time.Now()

	for _, line := range h.readJSONL(5000) {
		var o map[string]any
		if err := json.Unmarshal([]byte(line), &o); err != nil {
			continue
		}
		msg, _ := o["msg"].(string)
		level, _ := o["level"].(string)
		levels[level]++
		if msg != "http request" {
			continue
		}
		if ts, ok := o["time"].(string); ok {
			if t, err := time.Parse(time.RFC3339, ts); err == nil && now.Sub(t) < 24*time.Hour {
				perHour[t.Format("2006-01-02 15:00")]++
			}
		}
		if st, ok := o["status"].(float64); ok {
			switch {
			case st >= 500:
				statusBuckets["5xx"]++
			case st >= 400:
				statusBuckets["4xx"]++
			case st >= 200:
				statusBuckets["2xx"]++
			default:
				statusBuckets["other"]++
			}
		}
		if url, ok := o["url"].(string); ok {
			parts := strings.Fields(url)
			if len(parts) == 2 {
				endpoints[parts[1]]++
			}
		}
	}

	hours := []map[string]any{}
	keys := make([]string, 0, len(perHour))
	for k := range perHour {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		hours = append(hours, map[string]any{"hour": k, "count": perHour[k]})
	}

	type kv struct {
		k string
		v int
	}
	eps := []kv{}
	for k, v := range endpoints {
		eps = append(eps, kv{k, v})
	}
	sort.Slice(eps, func(i, j int) bool { return eps[i].v > eps[j].v })
	top := []map[string]any{}
	for i, e := range eps {
		if i >= 8 {
			break
		}
		top = append(top, map[string]any{"endpoint": e.k, "count": e.v})
	}

	levelList := []map[string]any{}
	for k, v := range levels {
		levelList = append(levelList, map[string]any{"level": k, "count": v})
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": map[string]any{
		"per_hour": hours, "status": statusBuckets, "top_endpoints": top, "levels": levelList,
	}})
}

func (h *Dev) Logs(w http.ResponseWriter, r *http.Request) {
	if !h.guard(w, r) {
		return
	}
	limit := 200
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 && n <= 2000 {
			limit = n
		}
	}
	lines := h.readJSONL(limit)
	writeJSON(w, http.StatusOK, map[string]any{"data": lines, "file": filepath.Base(h.newestLog())})
}

func (h *Dev) readJSONL(limit int) []string {
	path := h.newestLog()
	if path == "" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	all := []string{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for sc.Scan() {
		all = append(all, sc.Text())
	}
	if err := sc.Err(); err != nil {
		return all
	}
	if len(all) > limit {
		all = all[len(all)-limit:]
	}
	return all
}

func (h *Dev) newestLog() string {
	entries, err := os.ReadDir(h.logsDir)
	if err != nil {
		return ""
	}
	var best string
	var bestTime time.Time
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if best == "" || info.ModTime().After(bestTime) {
			best = filepath.Join(h.logsDir, e.Name())
			bestTime = info.ModTime()
		}
	}
	return best
}

func (h *Dev) logsSize() (int64, int) {
	entries, err := os.ReadDir(h.logsDir)
	if err != nil {
		return 0, 0
	}
	var total int64
	var count int
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		total += info.Size()
		count++
	}
	return total, count
}

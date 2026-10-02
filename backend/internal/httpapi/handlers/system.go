package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/neuralforgeio/StockKit/internal/platform/version"
)

// System serves liveness, readiness, and version endpoints.
type System struct {
	pg  *pgxpool.Pool
	rdb *redis.Client
}

func NewSystem(pg *pgxpool.Pool, rdb *redis.Client) System {
	return System{pg: pg, rdb: rdb}
}

// Healthz is the liveness probe without dependency checks (FR-PLT-12).
func (h System) Healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Readyz requires PostgreSQL and tolerates a degraded Redis (FR-PLT-12).
func (h System) Readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()

	if err := h.pg.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "unavailable",
			"failed": []string{"postgres"},
		})
		return
	}
	if err := h.rdb.Ping(ctx).Err(); err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":   "degraded",
			"degraded": []string{"redis"},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Version exposes build metadata per Appendix H.
func (h System) Version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, version.Get())
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

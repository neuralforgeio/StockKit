package handlers

import (
	"net/http"

	"github.com/neuralforgeio/StockKit/internal/dashboard"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Dashboard struct {
	svc *dashboard.Service
}

func NewDashboard(svc *dashboard.Service) *Dashboard {
	return &Dashboard{svc: svc}
}

// Summary handles GET /api/v1/dashboard/summary.
func (h *Dashboard) Summary(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	summary, err := h.svc.Summary(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": summary})
}

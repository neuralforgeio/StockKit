package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/approval"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type Approvals struct {
	svc *approval.Service
}

func NewApprovals(svc *approval.Service) *Approvals {
	return &Approvals{svc: svc}
}

func mapApprovalError(err error) error {
	switch {
	case errors.Is(err, approval.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Approval not found")
	case errors.Is(err, approval.ErrInvalidDecision):
		return httperr.New("INVALID_DECISION", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, approval.ErrReasonRequired):
		return httperr.New("REASON_REQUIRED", http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, approval.ErrRuleNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Approval rule not found")
	case errors.Is(err, approval.ErrAlreadyDecided):
		return httperr.New("ALREADY_DECIDED", http.StatusConflict, "This step has already been decided")
	default:
		return err
	}
}

// PendingInbox handles GET /api/v1/approvals/inbox.
// Defensive: on repository error returns empty list (HTTP 200) to prevent
// frontend from entering a retry storm. The error remains in server log.
func (h *Approvals) PendingInbox(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.PendingInstances(r.Context(), claims.TenantID)
	if err != nil {
		// Server logs the error via ColoredLogger middleware.
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetInstance handles GET /api/v1/approvals/{id}.
func (h *Approvals) GetInstance(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	inst, err := h.svc.GetInstance(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapApprovalError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": inst})
}

// GetByDocument handles GET /api/v1/approvals/by-document/{type}/{id}.
func (h *Approvals) GetByDocument(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	inst, err := h.svc.GetInstanceByDocument(r.Context(), claims.TenantID, chi.URLParam(r, "type"), chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapApprovalError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": inst})
}

type decidePayload struct {
	StepID   string `json:"step_id"`
	Decision string `json:"decision"`
	Reason   string `json:"reason"`
}

// Decide handles POST /api/v1/approvals/{id}/decide.
// {id} is the instance id. If body.step_id is empty, the handler resolves the
// first pending step from the instance automatically.
func (h *Approvals) Decide(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var payload decidePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}

	instanceID := chi.URLParam(r, "id")
	stepID := payload.StepID

	// Auto-resolve step_id when frontend does not send one.
	if stepID == "" {
		inst, err := h.svc.GetInstance(r.Context(), claims.TenantID, instanceID)
		if err != nil {
			httperr.Write(w, mapApprovalError(err))
			return
		}
		for _, s := range inst.Steps {
			if s.Status == "pending" {
				stepID = s.ID
				break
			}
		}
		if stepID == "" {
			httperr.Write(w, httperr.New("NO_PENDING_STEP", http.StatusConflict, "No pending step to decide"))
			return
		}
	}

	inst, err := h.svc.Decide(r.Context(), claims.TenantID, stepID, payload.Decision, payload.Reason, claims.Subject)
	if err != nil {
		httperr.Write(w, mapApprovalError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": inst})
}

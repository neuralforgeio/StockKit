package handlers

import (
	"encoding/json"
	"errors"
	"log/slog"
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

// writeInternal logs the ROOT cause server-side and returns a rich envelope
// so failures are visible in: backend log, frontend toast, and DevTools console.
func (h *Approvals) writeInternal(w http.ResponseWriter, r *http.Request, operation string, err error, extra map[string]any) {
	slog.Error("approval handler failed",
		"operation", operation,
		"path", r.URL.Path,
		"error", err,
	)
	wrapped := httperr.New("APPROVAL_"+operation+"_FAILED", http.StatusInternalServerError, err.Error())
	wrapped.WithDetails("operation", operation)
	for k, v := range extra {
		wrapped.WithDetails(k, v)
	}
	httperr.Write(w, wrapped)
}

// PendingInbox handles GET /api/v1/approvals/inbox.
func (h *Approvals) PendingInbox(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.PendingInstances(r.Context(), claims.TenantID)
	if err != nil {
		if mapped := mapApprovalError(err); mapped != err {
			httperr.Write(w, mapped)
			return
		}
		h.writeInternal(w, r, "INBOX", err, nil)
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
		if mapped := mapApprovalError(err); mapped != err {
			httperr.Write(w, mapped)
			return
		}
		h.writeInternal(w, r, "GET_INSTANCE", err, map[string]any{"instance_id": chi.URLParam(r, "id")})
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
		if mapped := mapApprovalError(err); mapped != err {
			httperr.Write(w, mapped)
			return
		}
		h.writeInternal(w, r, "GET_BY_DOCUMENT", err, map[string]any{"doc_type": chi.URLParam(r, "type"), "doc_id": chi.URLParam(r, "id")})
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
// {id} is the instance id; step_id optional (auto-resolves first pending step).
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

	if stepID == "" {
		inst, err := h.svc.GetInstance(r.Context(), claims.TenantID, instanceID)
		if err != nil {
			if mapped := mapApprovalError(err); mapped != err {
				httperr.Write(w, mapped)
				return
			}
			h.writeInternal(w, r, "DECIDE_RESOLVE_STEP", err, map[string]any{"instance_id": instanceID})
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
		if mapped := mapApprovalError(err); mapped != err {
			httperr.Write(w, mapped)
			return
		}
		h.writeInternal(w, r, "DECIDE", err, map[string]any{"instance_id": instanceID, "step_id": stepID})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": inst})
}

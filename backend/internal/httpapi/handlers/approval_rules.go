package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/approval"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

type ApprovalRules struct {
	svc *approval.Service
}

func NewApprovalRules(svc *approval.Service) *ApprovalRules {
	return &ApprovalRules{svc: svc}
}

type rulePayload struct {
	DocumentType   string `json:"document_type"`
	Name           string `json:"name"`
	ThresholdMinor int64  `json:"threshold_minor"`
	ApproverRole   string `json:"approver_role"`
	Level          int    `json:"level"`
	Active         bool   `json:"active"`
}

func (p rulePayload) rule() approval.Rule {
	return approval.Rule{
		DocumentType:   p.DocumentType,
		Name:           p.Name,
		ThresholdMinor: p.ThresholdMinor,
		ApproverRole:   p.ApproverRole,
		Level:          p.Level,
		Active:         p.Active,
	}
}

// List handles GET /api/v1/approval-rules.
func (h *ApprovalRules) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListRules(r.Context(), claims.TenantID)
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// Create handles POST /api/v1/approval-rules.
func (h *ApprovalRules) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload rulePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	if payload.DocumentType == "" || payload.ApproverRole == "" || payload.Level < 1 {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "document_type, approver_role, and level are required"))
		return
	}
	rule, err := h.svc.CreateRule(r.Context(), claims.TenantID, payload.rule())
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": rule})
}

// Update handles PATCH /api/v1/approval-rules/{id}.
func (h *ApprovalRules) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	var payload rulePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	rule, err := h.svc.UpdateRule(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.rule())
	if err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": rule})
}

// Delete handles DELETE /api/v1/approval-rules/{id}.
func (h *ApprovalRules) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.DeleteRule(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

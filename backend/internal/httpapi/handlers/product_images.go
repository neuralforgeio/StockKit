package handlers

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/products"
)

func mapImageError(err error) error {
	switch {
	case errors.Is(err, products.ErrNotFound):
		return httperr.New("NOT_FOUND", http.StatusNotFound, "Image not found")
	case errors.Is(err, products.ErrUnsupportedMime):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Use PNG, JPEG, or WebP images")
	case errors.Is(err, products.ErrImageTooLarge):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Image must be at most 2 MB")
	case errors.Is(err, products.ErrTooManyImages):
		return httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "A product holds at most 8 images")
	default:
		return err
	}
}

type productImageUpload struct {
	Mime string `json:"mime"`
	Data string `json:"data_base64"`
}

// UploadImage handles POST /api/v1/products/{id}/images.
func (h *Products) UploadImage(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var payload productImageUpload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Invalid request body"))
		return
	}
	raw, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "Image must be base64 encoded"))
		return
	}

	img, err := h.svc.AddImage(r.Context(), claims.TenantID, chi.URLParam(r, "id"), payload.Mime, raw)
	if err != nil {
		httperr.Write(w, mapImageError(err))
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"data": img})
}

// ListImages handles GET /api/v1/products/{id}/images.
func (h *Products) ListImages(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	list, err := h.svc.ListImages(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapProductError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": list})
}

// GetImageContent handles GET /api/v1/product-images/{id}/content.
func (h *Products) GetImageContent(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	img, data, err := h.svc.GetImage(r.Context(), claims.TenantID, chi.URLParam(r, "id"))
	if err != nil {
		httperr.Write(w, mapImageError(err))
		return
	}
	w.Header().Set("Content-Type", img.Mime)
	w.Header().Set("Cache-Control", "private, max-age=300")
	_, _ = w.Write(data)
}

// DeleteImage handles DELETE /api/v1/product-images/{id}.
func (h *Products) DeleteImage(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}
	if err := h.svc.DeleteImage(r.Context(), claims.TenantID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapImageError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// SetPrimaryImage handles POST /api/v1/product-images/{id}/set-primary.
func (h *Products) SetPrimaryImage(w http.ResponseWriter, r *http.Request) {
	claims, ok := requestClaims(r)
	if !ok {
		httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
		return
	}

	var req struct {
		ProductID string `json:"product_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ProductID == "" {
		httperr.Write(w, httperr.New("VALIDATION_FAILED", http.StatusUnprocessableEntity, "product_id is required"))
		return
	}

	if err := h.svc.SetPrimaryImage(r.Context(), claims.TenantID, req.ProductID, chi.URLParam(r, "id")); err != nil {
		httperr.Write(w, mapImageError(err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

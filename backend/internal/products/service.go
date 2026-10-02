package products

import (
	"context"
	"errors"
	"strings"
)

var (
	ErrSKURequired     = errors.New("sku is required")
	ErrNameRequired    = errors.New("name is required")
	ErrUnitRequired    = errors.New("unit is required")
	ErrUnsupportedMime = errors.New("unsupported image type")
	ErrImageTooLarge   = errors.New("image exceeds 2 MB limit")
	ErrTooManyImages   = errors.New("product already has 8 images")
)

const (
	maxImageBytes = 2 << 20
	maxImageCount = 8
)

var imageMimes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// NextSKU returns a non-reserved suggestion for the create form.
func (s *Service) NextSKU(ctx context.Context, tenantID string) (string, error) {
	return s.repo.NextSKU(ctx, tenantID)
}

// Create validates input and persists a new product for one tenant.
func (s *Service) Create(ctx context.Context, tenantID string, input CreateProductInput) (*Product, error) {
	if err := input.validate(); err != nil {
		return nil, err
	}
	if input.Type == "" {
		input.Type = "product"
	}
	if input.CostMethod == "" {
		input.CostMethod = "average"
	}
	return s.repo.Create(ctx, tenantID, input)
}

// GetByID returns one product or ErrNotFound.
func (s *Service) GetByID(ctx context.Context, tenantID, id string) (*Product, error) {
	return s.repo.GetByID(ctx, tenantID, id)
}

// List returns a cursor page of active products.
func (s *Service) List(ctx context.Context, tenantID string, limit int, cursor *string) ([]Product, *string, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	return s.repo.List(ctx, tenantID, limit, cursor)
}

// Update validates input and persists changes to one product.
func (s *Service) Update(ctx context.Context, tenantID, id string, input CreateProductInput) (*Product, error) {
	if err := input.validate(); err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, tenantID, id, input)
}

// Delete soft-deletes a product while history keeps resolving by id.
func (s *Service) Delete(ctx context.Context, tenantID, id string) error {
	return s.repo.Delete(ctx, tenantID, id)
}

// AddImage validates MIME and size, then stores one product image.
func (s *Service) AddImage(ctx context.Context, tenantID, productID, mime string, data []byte) (*ProductImage, error) {
	if !imageMimes[mime] {
		return nil, ErrUnsupportedMime
	}
	if len(data) == 0 || len(data) > maxImageBytes {
		return nil, ErrImageTooLarge
	}
	count, err := s.repo.CountImages(ctx, tenantID, productID)
	if err != nil {
		return nil, err
	}
	if count >= maxImageCount {
		return nil, ErrTooManyImages
	}
	return s.repo.CreateImage(ctx, tenantID, productID, mime, data)
}

// ListImages returns image metadata for one product.
func (s *Service) ListImages(ctx context.Context, tenantID, productID string) ([]ProductImage, error) {
	return s.repo.ListImages(ctx, tenantID, productID)
}

// GetImage returns one image payload for streaming.
func (s *Service) GetImage(ctx context.Context, tenantID, imageID string) (*ProductImage, []byte, error) {
	return s.repo.GetImage(ctx, tenantID, imageID)
}

// DeleteImage removes one image and repairs the primary flag.
func (s *Service) DeleteImage(ctx context.Context, tenantID, imageID string) error {
	return s.repo.DeleteImage(ctx, tenantID, imageID)
}

// SetPrimaryImage marks one image as the catalog thumbnail.
func (s *Service) SetPrimaryImage(ctx context.Context, tenantID, productID, imageID string) error {
	return s.repo.SetPrimaryImage(ctx, tenantID, productID, imageID)
}

func (i CreateProductInput) validate() error {
	if strings.TrimSpace(i.SKU) == "" {
		return ErrSKURequired
	}
	if strings.TrimSpace(i.Name) == "" {
		return ErrNameRequired
	}
	if i.UnitID == "" {
		return ErrUnitRequired
	}
	return nil
}

package products

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

var (
	ErrNotFound = errors.New("product not found")
)

type Product struct {
	ID                    string    `json:"id"`
	TenantID              string    `json:"tenant_id"`
	SKU                   string    `json:"sku"`
	Barcode               *string   `json:"barcode"`
	Name                  string    `json:"name"`
	Type                  string    `json:"type"`
	CategoryID            *string   `json:"category_id"`
	UnitID                string    `json:"unit_id"`
	CostMethod            string    `json:"cost_method"`
	DefaultSellPriceMinor int64     `json:"default_sell_price_minor"`
	DefaultBuyPriceMinor  int64     `json:"default_buy_price_minor"`
	MinStock              int64     `json:"min_stock"`
	Active                bool      `json:"active"`
	PrimaryImageID        *string   `json:"primary_image_id"`
	CreatedAt             time.Time `json:"created_at"`
	UpdatedAt             time.Time `json:"updated_at"`
}

type ProductImage struct {
	ID        string    `json:"id"`
	ProductID string    `json:"product_id"`
	Position  int       `json:"position"`
	IsPrimary bool      `json:"is_primary"`
	Mime      string    `json:"mime"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateProductInput struct {
	SKU                   string
	Barcode               *string
	Name                  string
	Type                  string
	CategoryID            *string
	UnitID                string
	CostMethod            string
	DefaultSellPriceMinor int64
	DefaultBuyPriceMinor  int64
	MinStock              int64
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const productColumns = `p.id, p.tenant_id, p.sku, p.barcode, p.name, p.type, p.category_id, p.unit_id,
	p.cost_method, p.default_sell_price_minor, p.default_buy_price_minor,
	p.min_stock, p.active, pi.id, p.created_at, p.updated_at`

const productJoin = `LEFT JOIN product_images pi
	ON pi.tenant_id = p.tenant_id AND pi.product_id = p.id AND pi.is_primary`

func scanProduct(row interface{ Scan(...any) error }) (*Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.TenantID, &p.SKU, &p.Barcode, &p.Name, &p.Type,
		&p.CategoryID, &p.UnitID, &p.CostMethod, &p.DefaultSellPriceMinor,
		&p.DefaultBuyPriceMinor, &p.MinStock, &p.Active, &p.PrimaryImageID,
		&p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// NextSKU peeks the next system suggestion derived from existing numeric SKUs.
func (r *Repository) NextSKU(ctx context.Context, tenantID string) (string, error) {
	var next int64
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(MAX((regexp_match(sku, '^SKU-([0-9]+)$'))[1]::bigint), 0) + 1
		FROM products
		WHERE tenant_id = $1`, tenantID).Scan(&next)
	if err != nil {
		return "", fmt.Errorf("peek next sku: %w", err)
	}
	return fmt.Sprintf("SKU-%04d", next), nil
}

// Create inserts one product row and returns the persisted entity.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateProductInput) (*Product, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO products (
			tenant_id, sku, barcode, name, type, category_id, unit_id,
			cost_method, default_sell_price_minor, default_buy_price_minor, min_stock
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING `+productColumns,
		tenantID, input.SKU, input.Barcode, input.Name, input.Type, input.CategoryID,
		input.UnitID, input.CostMethod, input.DefaultSellPriceMinor,
		input.DefaultBuyPriceMinor, input.MinStock)

	product, err := scanProduct(row)
	if err != nil {
		return nil, fmt.Errorf("insert product: %w", err)
	}
	return product, nil
}

// GetByID returns one active product or ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Product, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+productColumns+`
		FROM products p
		`+productJoin+`
		WHERE p.id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL`,
		id, tenantID)

	product, err := scanProduct(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query product: %w", err)
	}
	return product, nil
}

// List returns a cursor page of active products ordered by creation time.
func (r *Repository) List(ctx context.Context, tenantID string, limit int, cursor *string) ([]Product, *string, error) {
	query := `
		SELECT ` + productColumns + `
		FROM products p
		` + productJoin + `
		WHERE p.tenant_id = $1 AND p.deleted_at IS NULL`
	args := []any{tenantID}

	if cursor != nil {
		query += ` AND p.created_at < $2`
		args = append(args, *cursor)
	}

	query += ` ORDER BY p.created_at DESC, p.id DESC LIMIT $` + fmt.Sprint(len(args)+1)
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("query products: %w", err)
	}
	defer rows.Close()

	products := make([]Product, 0, limit+1)
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, nil, fmt.Errorf("scan product: %w", err)
		}
		products = append(products, *p)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate products: %w", err)
	}

	var nextCursor *string
	if len(products) > limit {
		products = products[:limit]
		last := products[len(products)-1].CreatedAt.UTC().Format(time.RFC3339Nano)
		nextCursor = &last
	}

	return products, nextCursor, nil
}

// Update persists changes to one active product and returns the new state.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateProductInput) (*Product, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE products SET
			sku = $3, barcode = $4, name = $5, type = $6, category_id = $7,
			unit_id = $8, cost_method = $9, default_sell_price_minor = $10,
			default_buy_price_minor = $11, min_stock = $12, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+productColumns,
		id, tenantID, input.SKU, input.Barcode, input.Name, input.Type,
		input.CategoryID, input.UnitID, input.CostMethod,
		input.DefaultSellPriceMinor, input.DefaultBuyPriceMinor, input.MinStock)

	product, err := scanProduct(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update product: %w", err)
	}
	return product, nil
}

// Delete soft-deletes one product and reports ErrNotFound when absent.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE products SET deleted_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete product: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CreateImage appends one image; the first image becomes primary automatically.
func (r *Repository) CreateImage(ctx context.Context, tenantID, productID, mime string, data []byte) (*ProductImage, error) {
	var img ProductImage
	err := r.pool.QueryRow(ctx, `
		WITH next_pos AS (
			SELECT COALESCE(MAX(position), 0) + 1 AS pos
			FROM product_images
			WHERE tenant_id = $1 AND product_id = $2
		),
		first_image AS (
			SELECT NOT EXISTS (
				SELECT 1 FROM product_images WHERE tenant_id = $1 AND product_id = $2
			) AS is_first
		)
		INSERT INTO product_images (tenant_id, product_id, position, is_primary, mime, data)
		SELECT $1, $2, next_pos.pos, first_image.is_first, $3, $4
		FROM next_pos, first_image
		RETURNING id, product_id, position, is_primary, mime, created_at`,
		tenantID, productID, mime, data).
		Scan(&img.ID, &img.ProductID, &img.Position, &img.IsPrimary, &img.Mime, &img.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert product image: %w", err)
	}
	return &img, nil
}

// ListImages returns image metadata ordered by position.
func (r *Repository) ListImages(ctx context.Context, tenantID, productID string) ([]ProductImage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, product_id, position, is_primary, mime, created_at
		FROM product_images
		WHERE tenant_id = $1 AND product_id = $2
		ORDER BY position`,
		tenantID, productID)
	if err != nil {
		return nil, fmt.Errorf("query product images: %w", err)
	}
	defer rows.Close()

	list := make([]ProductImage, 0)
	for rows.Next() {
		var img ProductImage
		if err := rows.Scan(&img.ID, &img.ProductID, &img.Position, &img.IsPrimary, &img.Mime, &img.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan product image: %w", err)
		}
		list = append(list, img)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate product images: %w", err)
	}
	return list, nil
}

// GetImage returns one image row including binary payload.
func (r *Repository) GetImage(ctx context.Context, tenantID, imageID string) (*ProductImage, []byte, error) {
	var img ProductImage
	var data []byte
	err := r.pool.QueryRow(ctx, `
		SELECT id, product_id, position, is_primary, mime, created_at, data
		FROM product_images
		WHERE id = $1 AND tenant_id = $2`,
		imageID, tenantID).
		Scan(&img.ID, &img.ProductID, &img.Position, &img.IsPrimary, &img.Mime, &img.CreatedAt, &data)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("query product image: %w", err)
	}
	return &img, data, nil
}

// CountImages returns how many images a product currently holds.
func (r *Repository) CountImages(ctx context.Context, tenantID, productID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM product_images WHERE tenant_id = $1 AND product_id = $2`,
		tenantID, productID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count product images: %w", err)
	}
	return count, nil
}

// DeleteImage removes one image and promotes the lowest-position remaining image when needed.
func (r *Repository) DeleteImage(ctx context.Context, tenantID, imageID string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var productID string
		var wasPrimary bool
		err := tx.QueryRow(ctx, `
			DELETE FROM product_images
			WHERE id = $1 AND tenant_id = $2
			RETURNING product_id, is_primary`,
			imageID, tenantID).Scan(&productID, &wasPrimary)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			return fmt.Errorf("delete product image: %w", err)
		}

		if wasPrimary {
			_, err = tx.Exec(ctx, `
				UPDATE product_images SET is_primary = true
				WHERE id = (
					SELECT id FROM product_images
					WHERE tenant_id = $1 AND product_id = $2
					ORDER BY position LIMIT 1
				)`,
				tenantID, productID)
			if err != nil {
				return fmt.Errorf("promote replacement primary: %w", err)
			}
		}
		return nil
	})
}

// SetPrimaryImage flips the primary flag using two ordered statements so the
// partial unique index never sees two primary rows mid-update.
func (r *Repository) SetPrimaryImage(ctx context.Context, tenantID, productID, imageID string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE product_images SET is_primary = false
			WHERE tenant_id = $1 AND product_id = $2 AND is_primary = true`,
			tenantID, productID)
		if err != nil {
			return fmt.Errorf("clear primary flag: %w", err)
		}

		tag, err := tx.Exec(ctx, `
			UPDATE product_images SET is_primary = true
			WHERE id = $1 AND tenant_id = $2 AND product_id = $3`,
			imageID, tenantID, productID)
		if err != nil {
			return fmt.Errorf("set primary flag: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

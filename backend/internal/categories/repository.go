package categories

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound       = errors.New("category not found")
	ErrNameRequired   = errors.New("name is required")
	ErrCircularParent = errors.New("category cannot be its own parent or descendant")
	ErrReferenced     = errors.New("category is referenced and cannot be deleted")
)

type Category struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Name      string    `json:"name"`
	ParentID  *string   `json:"parent_id"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateCategoryInput struct {
	Name     string
	ParentID *string
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const categoryColumns = `id, tenant_id, name, parent_id, active, created_at, updated_at`

func scanCategory(row interface{ Scan(...any) error }) (*Category, error) {
	var c Category
	err := row.Scan(&c.ID, &c.TenantID, &c.Name, &c.ParentID, &c.Active, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Create inserts a new category.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateCategoryInput) (*Category, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO categories (tenant_id, name, parent_id)
		VALUES ($1, $2, $3)
		RETURNING `+categoryColumns,
		tenantID, input.Name, input.ParentID)

	cat, err := scanCategory(row)
	if err != nil {
		return nil, fmt.Errorf("insert category: %w", err)
	}
	return cat, nil
}

// GetByID returns one category or ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Category, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+categoryColumns+`
		FROM categories
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)

	cat, err := scanCategory(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query category: %w", err)
	}
	return cat, nil
}

// List returns all non-deleted categories ordered by name.
func (r *Repository) List(ctx context.Context, tenantID string) ([]Category, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+categoryColumns+`
		FROM categories
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY name`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query categories: %w", err)
	}
	defer rows.Close()

	list := make([]Category, 0)
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		list = append(list, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate categories: %w", err)
	}
	return list, nil
}

// Update persists name and parent changes.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateCategoryInput) (*Category, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE categories SET name = $3, parent_id = $4, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+categoryColumns,
		id, tenantID, input.Name, input.ParentID)

	cat, err := scanCategory(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update category: %w", err)
	}
	return cat, nil
}

// SetActive toggles the active flag per FR-MD-06a.
func (r *Repository) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE categories SET active = $3, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID, active)
	if err != nil {
		return fmt.Errorf("toggle category active: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete soft-deletes a category only when unreferenced by products or children.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	var used int64
	err := r.pool.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM products WHERE tenant_id = $1 AND category_id = $2 AND deleted_at IS NULL) +
		       (SELECT COUNT(*) FROM categories WHERE tenant_id = $1 AND parent_id = $2 AND deleted_at IS NULL)`,
		tenantID, id).Scan(&used)
	if err != nil {
		return fmt.Errorf("check category usage: %w", err)
	}
	if used > 0 {
		return ErrReferenced
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE categories SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete category: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// IsDescendant reports whether candidateParentID lies inside the subtree of categoryID.
func (r *Repository) IsDescendant(ctx context.Context, tenantID, categoryID, candidateParentID string) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx, `
		WITH RECURSIVE descendants AS (
			SELECT id FROM categories WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
			UNION ALL
			SELECT c.id FROM categories c
			INNER JOIN descendants d ON c.parent_id = d.id
			WHERE c.tenant_id = $2 AND c.deleted_at IS NULL
		)
		SELECT COUNT(*) FROM descendants WHERE id = $3`,
		categoryID, tenantID, candidateParentID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check descendant: %w", err)
	}
	return count > 0, nil
}

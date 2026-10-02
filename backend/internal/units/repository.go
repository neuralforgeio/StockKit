package units

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound   = errors.New("unit not found")
	ErrReferenced = errors.New("unit is used by products and cannot be deleted")
)

type Unit struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateUnitInput struct {
	Code string
	Name string
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

const unitColumns = `id, tenant_id, code, name, active, created_at`

func scanUnit(row interface{ Scan(...any) error }) (*Unit, error) {
	var u Unit
	err := row.Scan(&u.ID, &u.TenantID, &u.Code, &u.Name, &u.Active, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// Create inserts a new unit.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateUnitInput) (*Unit, error) {
	row := r.pool.QueryRow(ctx, `
		INSERT INTO units (tenant_id, code, name)
		VALUES ($1, $2, $3)
		RETURNING `+unitColumns,
		tenantID, input.Code, input.Name)

	unit, err := scanUnit(row)
	if err != nil {
		return nil, fmt.Errorf("insert unit: %w", err)
	}
	return unit, nil
}

// List returns all non-deleted units ordered by code.
func (r *Repository) List(ctx context.Context, tenantID string) ([]Unit, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+unitColumns+`
		FROM units
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY code`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query units: %w", err)
	}
	defer rows.Close()

	list := make([]Unit, 0)
	for rows.Next() {
		u, err := scanUnit(rows)
		if err != nil {
			return nil, fmt.Errorf("scan unit: %w", err)
		}
		list = append(list, *u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate units: %w", err)
	}
	return list, nil
}

// Update persists code and name changes.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateUnitInput) (*Unit, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE units SET code = $3, name = $4, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+unitColumns,
		id, tenantID, input.Code, input.Name)

	unit, err := scanUnit(row)
	if err != nil {
		return nil, ErrNotFound
	}
	return unit, nil
}

// Delete soft-deletes a unit only when no active product uses it.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	var used int64
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM products
		WHERE tenant_id = $1 AND unit_id = $2 AND deleted_at IS NULL`,
		tenantID, id).Scan(&used)
	if err != nil {
		return fmt.Errorf("check unit usage: %w", err)
	}
	if used > 0 {
		return ErrReferenced
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE units SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete unit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

package warehouses

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/codes"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

var (
	ErrNotFound     = errors.New("warehouse not found")
	ErrNameRequired = errors.New("name is required")
	ErrReferenced   = errors.New("warehouse still holds stock and cannot be deleted")
)

type Warehouse struct {
	ID        string    `json:"id"`
	TenantID  string    `json:"tenant_id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	Branch    *string   `json:"branch"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type CreateWarehouseInput struct {
	Name   string
	Branch *string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const warehouseColumns = `id, tenant_id, code, name, branch, active, created_at, updated_at`

func scanWarehouse(row interface{ Scan(...any) error }) (*Warehouse, error) {
	var w Warehouse
	err := row.Scan(&w.ID, &w.TenantID, &w.Code, &w.Name, &w.Branch, &w.Active, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

// Create inserts a new warehouse with an allocated code inside a transaction.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateWarehouseInput) (*Warehouse, error) {
	var wh *Warehouse
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "WH")
		if err != nil {
			return err
		}

		row := tx.QueryRow(ctx, `
			INSERT INTO warehouses (tenant_id, code, name, branch)
			VALUES ($1, $2, $3, $4)
			RETURNING `+warehouseColumns,
			tenantID, number, input.Name, input.Branch)

		w, err := scanWarehouse(row)
		if err != nil {
			return fmt.Errorf("insert warehouse: %w", err)
		}
		wh = w
		return nil
	})
	if err != nil {
		return nil, err
	}
	return wh, nil
}

// GetByID returns one warehouse or ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Warehouse, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+warehouseColumns+`
		FROM warehouses
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)

	wh, err := scanWarehouse(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query warehouse: %w", err)
	}
	return wh, nil
}

// List returns all non-deleted warehouses ordered by code.
func (r *Repository) List(ctx context.Context, tenantID string) ([]Warehouse, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+warehouseColumns+`
		FROM warehouses
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY code`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query warehouses: %w", err)
	}
	defer rows.Close()

	list := make([]Warehouse, 0)
	for rows.Next() {
		w, err := scanWarehouse(rows)
		if err != nil {
			return nil, fmt.Errorf("scan warehouse: %w", err)
		}
		list = append(list, *w)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate warehouses: %w", err)
	}
	return list, nil
}

// Update persists name and branch changes.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateWarehouseInput) (*Warehouse, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE warehouses SET name = $3, branch = $4, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+warehouseColumns,
		id, tenantID, input.Name, input.Branch)

	wh, err := scanWarehouse(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update warehouse: %w", err)
	}
	return wh, nil
}

// SetActive toggles the active flag per FR-MD-06a.
func (r *Repository) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE warehouses SET active = $3, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID, active)
	if err != nil {
		return fmt.Errorf("toggle warehouse active: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete soft-deletes a warehouse only when it holds no stock.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	var held int64
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM stock_levels
		WHERE tenant_id = $1 AND warehouse_id = $2 AND (on_hand > 0 OR reserved > 0)`,
		tenantID, id).Scan(&held)
	if err != nil {
		return fmt.Errorf("check warehouse stock: %w", err)
	}
	if held > 0 {
		return ErrReferenced
	}

	tag, err := r.pool.Exec(ctx, `
		UPDATE warehouses SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete warehouse: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

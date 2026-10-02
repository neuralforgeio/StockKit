package suppliers

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
	ErrNotFound                = errors.New("supplier not found")
	ErrNameRequired            = errors.New("name is required")
	ErrEncryptionNotConfigured = errors.New("field encryption key not configured")
)

type Supplier struct {
	ID                string    `json:"id"`
	TenantID          string    `json:"tenant_id"`
	Code              string    `json:"code"`
	Name              string    `json:"name"`
	ContactName       string    `json:"contact_name"`
	Email             *string   `json:"email"`
	Phone             string    `json:"phone"`
	Address           string    `json:"address"`
	TaxID             string    `json:"tax_id"`
	PaymentTermsDays  int       `json:"payment_terms_days"`
	BankAccount       *string   `json:"-"`
	BankAccountMasked *string   `json:"bank_account_masked"`
	Active            bool      `json:"active"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type CreateSupplierInput struct {
	Name             string
	ContactName      string
	Email            *string
	Phone            string
	Address          string
	TaxID            string
	PaymentTermsDays int
	BankAccount      *string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const supplierColumns = `id, tenant_id, code, name, contact_name, email, phone,
	address, tax_id, payment_terms_days, bank_account, active, created_at, updated_at`

func scanSupplier(row interface{ Scan(...any) error }) (*Supplier, error) {
	var s Supplier
	err := row.Scan(&s.ID, &s.TenantID, &s.Code, &s.Name, &s.ContactName, &s.Email,
		&s.Phone, &s.Address, &s.TaxID, &s.PaymentTermsDays, &s.BankAccount,
		&s.Active, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// Create inserts a new supplier with an allocated code inside a transaction.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateSupplierInput) (*Supplier, error) {
	var sup *Supplier
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "SUP")
		if err != nil {
			return err
		}

		row := tx.QueryRow(ctx, `
			INSERT INTO suppliers (
				tenant_id, code, name, contact_name, email, phone, address,
				tax_id, payment_terms_days, bank_account
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			RETURNING `+supplierColumns,
			tenantID, number, input.Name, input.ContactName, input.Email,
			input.Phone, input.Address, input.TaxID, input.PaymentTermsDays, input.BankAccount)

		s, err := scanSupplier(row)
		if err != nil {
			return fmt.Errorf("insert supplier: %w", err)
		}
		sup = s
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sup, nil
}

// GetByID returns one supplier or ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Supplier, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+supplierColumns+`
		FROM suppliers
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)

	sup, err := scanSupplier(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query supplier: %w", err)
	}
	return sup, nil
}

// List returns all non-deleted suppliers ordered by code.
func (r *Repository) List(ctx context.Context, tenantID string) ([]Supplier, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+supplierColumns+`
		FROM suppliers
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY code`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query suppliers: %w", err)
	}
	defer rows.Close()

	list := make([]Supplier, 0)
	for rows.Next() {
		s, err := scanSupplier(rows)
		if err != nil {
			return nil, fmt.Errorf("scan supplier: %w", err)
		}
		list = append(list, *s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate suppliers: %w", err)
	}
	return list, nil
}

// Update persists changes to one supplier.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateSupplierInput) (*Supplier, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE suppliers SET
			name = $3, contact_name = $4, email = $5, phone = $6, address = $7,
			tax_id = $8, payment_terms_days = $9,
			bank_account = COALESCE($10, bank_account), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+supplierColumns,
		id, tenantID, input.Name, input.ContactName, input.Email,
		input.Phone, input.Address, input.TaxID, input.PaymentTermsDays, input.BankAccount)

	sup, err := scanSupplier(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update supplier: %w", err)
	}
	return sup, nil
}

// SetActive toggles the active flag per FR-MD-06a.
func (r *Repository) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE suppliers SET active = $3, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID, active)
	if err != nil {
		return fmt.Errorf("toggle supplier active: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete soft-deletes one supplier.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE suppliers SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete supplier: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

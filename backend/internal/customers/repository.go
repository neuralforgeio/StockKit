package customers

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
	ErrNotFound = errors.New("customer not found")
)

type Customer struct {
	ID                string    `json:"id"`
	TenantID          string    `json:"tenant_id"`
	Code              string    `json:"code"`
	Name              string    `json:"name"`
	Type              string    `json:"type"`
	ContactName       string    `json:"contact_name"`
	Email             *string   `json:"email"`
	Phone             string    `json:"phone"`
	Address           string    `json:"address"`
	TaxID             string    `json:"tax_id"`
	PaymentTermsDays  int       `json:"payment_terms_days"`
	CreditLimitMinor  int64     `json:"credit_limit_minor"`
	SalespersonID     *string   `json:"salesperson_id"`
	OpenExposureMinor int64     `json:"open_exposure_minor"`
	Active            bool      `json:"active"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type CreateCustomerInput struct {
	Name             string
	Type             string
	ContactName      string
	Email            *string
	Phone            string
	Address          string
	TaxID            string
	PaymentTermsDays int
	CreditLimitMinor int64
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const customerColumns = `id, tenant_id, code, name, type, contact_name, email, phone,
	address, tax_id, payment_terms_days, credit_limit_minor, salesperson_id,
	open_exposure_minor, active, created_at, updated_at`

func scanCustomer(row interface{ Scan(...any) error }) (*Customer, error) {
	var c Customer
	err := row.Scan(&c.ID, &c.TenantID, &c.Code, &c.Name, &c.Type, &c.ContactName,
		&c.Email, &c.Phone, &c.Address, &c.TaxID, &c.PaymentTermsDays,
		&c.CreditLimitMinor, &c.SalespersonID, &c.OpenExposureMinor,
		&c.Active, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Create inserts a new customer with an allocated code inside a transaction.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateCustomerInput) (*Customer, error) {
	var cust *Customer
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "CUS")
		if err != nil {
			return err
		}

		row := tx.QueryRow(ctx, `
			INSERT INTO customers (
				tenant_id, code, name, type, contact_name, email, phone, address,
				tax_id, payment_terms_days, credit_limit_minor
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			RETURNING `+customerColumns,
			tenantID, number, input.Name, input.Type, input.ContactName, input.Email,
			input.Phone, input.Address, input.TaxID, input.PaymentTermsDays, input.CreditLimitMinor)

		c, err := scanCustomer(row)
		if err != nil {
			return fmt.Errorf("insert customer: %w", err)
		}
		cust = c
		return nil
	})
	if err != nil {
		return nil, err
	}
	return cust, nil
}

// GetByID returns one customer or ErrNotFound.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*Customer, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+customerColumns+`
		FROM customers
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)

	cust, err := scanCustomer(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query customer: %w", err)
	}
	return cust, nil
}

// List returns all non-deleted customers ordered by code.
func (r *Repository) List(ctx context.Context, tenantID string) ([]Customer, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+customerColumns+`
		FROM customers
		WHERE tenant_id = $1 AND deleted_at IS NULL
		ORDER BY code`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query customers: %w", err)
	}
	defer rows.Close()

	list := make([]Customer, 0)
	for rows.Next() {
		c, err := scanCustomer(rows)
		if err != nil {
			return nil, fmt.Errorf("scan customer: %w", err)
		}
		list = append(list, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate customers: %w", err)
	}
	return list, nil
}

// Update persists changes to one customer.
func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreateCustomerInput) (*Customer, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE customers SET
			name = $3, type = $4, contact_name = $5, email = $6, phone = $7,
			address = $8, tax_id = $9, payment_terms_days = $10, credit_limit_minor = $11,
			updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
		RETURNING `+customerColumns,
		id, tenantID, input.Name, input.Type, input.ContactName, input.Email,
		input.Phone, input.Address, input.TaxID, input.PaymentTermsDays, input.CreditLimitMinor)

	cust, err := scanCustomer(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update customer: %w", err)
	}
	return cust, nil
}

// SetActive toggles the active flag per FR-MD-06a.
func (r *Repository) SetActive(ctx context.Context, tenantID, id string, active bool) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE customers SET active = $3, updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID, active)
	if err != nil {
		return fmt.Errorf("toggle customer active: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete soft-deletes one customer.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE customers SET deleted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
		id, tenantID)
	if err != nil {
		return fmt.Errorf("soft delete customer: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

package finance

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
	ErrNotFound         = errors.New("cash account not found")
	ErrAccountInUse     = errors.New("cash account has payments; deactivate instead")
	ErrInvalidTransition = errors.New("illegal transition")
)

type CashAccount struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	Number        string    `json:"number"`
	Name          string    `json:"name"`
	AccountType   string    `json:"account_type"`
	Currency      string    `json:"currency"`
	BalanceMinor  int64     `json:"balance_minor"`
	IsActive      bool      `json:"is_active"`
	Notes         string    `json:"notes"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	PaymentCount  int64     `json:"payment_count"`
	PaymentTotal  int64     `json:"payment_total"`
}

type CreateInput struct {
	Name         string
	AccountType  string
	Currency     string
	BalanceMinor int64
	Notes        string
}

type UpdateInput struct {
	Name         *string
	AccountType  *string
	Notes        *string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const columns = `ca.id, ca.tenant_id, ca.number, ca.name, ca.account_type, ca.currency,
	ca.balance_minor, ca.is_active, ca.notes, ca.created_at, ca.updated_at,
	(SELECT COUNT(*) FROM payments p WHERE p.tenant_id = ca.tenant_id AND p.cash_account_id = ca.id AND p.status = 'completed'),
	(SELECT COALESCE(SUM(p.amount_minor), 0) FROM payments p WHERE p.tenant_id = ca.tenant_id AND p.cash_account_id = ca.id AND p.status = 'completed')`

func scan(row interface{ Scan(...any) error }) (*CashAccount, error) {
	var a CashAccount
	err := row.Scan(&a.ID, &a.TenantID, &a.Number, &a.Name, &a.AccountType,
		&a.Currency, &a.BalanceMinor, &a.IsActive, &a.Notes,
		&a.CreatedAt, &a.UpdatedAt, &a.PaymentCount, &a.PaymentTotal)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Create inserts a new cash account with a system-allocated number.
func (r *Repository) Create(ctx context.Context, tenantID string, input CreateInput) (*CashAccount, error) {
	var account *CashAccount
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "CA")
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx, `
			INSERT INTO cash_accounts (
				tenant_id, number, name, account_type, currency, balance_minor, notes
			) VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING `+columns,
			tenantID, number, input.Name, input.AccountType,
			input.Currency, input.BalanceMinor, input.Notes)
		created, err := scan(row)
		if err != nil {
			return fmt.Errorf("insert cash account: %w", err)
		}
		account = created
		return nil
	})
	if err != nil {
		return nil, err
	}
	return account, nil
}

// List returns all cash accounts with payment aggregates.
func (r *Repository) List(ctx context.Context, tenantID string) ([]CashAccount, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+columns+`
		FROM cash_accounts ca
		WHERE ca.tenant_id = $1
		ORDER BY ca.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query cash accounts: %w", err)
	}
	defer rows.Close()
	list := make([]CashAccount, 0)
	for rows.Next() {
		a, err := scan(rows)
		if err != nil {
			return nil, fmt.Errorf("scan cash account: %w", err)
		}
		list = append(list, *a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate cash accounts: %w", err)
	}
	return list, nil
}

// GetByID returns one cash account.
func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*CashAccount, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+columns+`
		FROM cash_accounts ca
		WHERE ca.id = $1 AND ca.tenant_id = $2`, id, tenantID)
	a, err := scan(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query cash account: %w", err)
	}
	return a, nil
}

// Update replaces editable fields (name, type, notes).
func (r *Repository) Update(ctx context.Context, tenantID, id string, input UpdateInput) (*CashAccount, error) {
	_, err := r.pool.Exec(ctx, `
		UPDATE cash_accounts
		SET name = COALESCE($3, name),
		    account_type = COALESCE($4, account_type),
		    notes = COALESCE($5, notes),
		    updated_at = now()
		WHERE id = $1 AND tenant_id = $2`,
		id, tenantID, input.Name, input.AccountType, input.Notes)
	if err != nil {
		return nil, fmt.Errorf("update cash account: %w", err)
	}
	return r.GetByID(ctx, tenantID, id)
}

// SetActive toggles is_active.
func (r *Repository) SetActive(ctx context.Context, tenantID, id string, active bool) (*CashAccount, error) {
	tag, err := r.pool.Exec(ctx, `
		UPDATE cash_accounts SET is_active = $3, updated_at = now()
		WHERE id = $1 AND tenant_id = $2`, id, tenantID, active)
	if err != nil {
		return nil, fmt.Errorf("set active: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return r.GetByID(ctx, tenantID, id)
}

// Delete removes a cash account only if no payments reference it.
func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var count int64
		err := tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM payments
			WHERE tenant_id = $1 AND cash_account_id = $2`, tenantID, id).Scan(&count)
		if err != nil {
			return fmt.Errorf("count payments: %w", err)
		}
		if count > 0 {
			return ErrAccountInUse
		}
		tag, err := tx.Exec(ctx, `DELETE FROM cash_accounts WHERE id = $1 AND tenant_id = $2`, id, tenantID)
		if err != nil {
			return fmt.Errorf("delete cash account: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
		return nil
	})
}

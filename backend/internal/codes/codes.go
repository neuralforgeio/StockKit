package codes

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Allocator hands out sequential tenant-scoped identifiers for master data.
type Allocator struct {
	pool *pgxpool.Pool
}

// NewAllocator builds an allocator backed by the code_sequences table.
func NewAllocator(pool *pgxpool.Pool) *Allocator {
	return &Allocator{pool: pool}
}

// Next allocates the next identifier for a prefix inside the caller transaction.
func (a *Allocator) Next(ctx context.Context, tx pgx.Tx, tenantID, prefix string) (string, error) {
	var last int64
	err := tx.QueryRow(ctx, `
		INSERT INTO code_sequences (tenant_id, prefix, last_value)
		VALUES ($1, $2, 1)
		ON CONFLICT (tenant_id, prefix)
		DO UPDATE SET last_value = code_sequences.last_value + 1
		RETURNING last_value`, tenantID, prefix).Scan(&last)
	if err != nil {
		return "", fmt.Errorf("allocate code %s: %w", prefix, err)
	}
	return fmt.Sprintf("%s-%04d", prefix, last), nil
}

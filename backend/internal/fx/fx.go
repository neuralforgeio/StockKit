package fx

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNoRate = errors.New("no FX rate found for pair")
)

type Rate struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	BaseCurrency  string    `json:"base_currency"`
	QuoteCurrency string    `json:"quote_currency"`
	Rate          float64   `json:"rate"`
	EffectiveDate string    `json:"effective_date"`
	Source        string    `json:"source"`
	CreatedAt     time.Time `json:"created_at"`
}

type Repository struct{ pool *pgxpool.Pool }

func NewRepository(pool *pgxpool.Pool) *Repository { return &Repository{pool: pool} }

func (r *Repository) List(ctx context.Context, tenantID string) ([]Rate, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, tenant_id, base_currency, quote_currency, rate::float8,
		       effective_date::text, source, created_at
		FROM fx_rates WHERE tenant_id = $1
		ORDER BY effective_date DESC, base_currency, quote_currency`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query fx rates: %w", err)
	}
	defer rows.Close()
	out := []Rate{}
	for rows.Next() {
		var rt Rate
		if err := rows.Scan(&rt.ID, &rt.TenantID, &rt.BaseCurrency, &rt.QuoteCurrency, &rt.Rate, &rt.EffectiveDate, &rt.Source, &rt.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan fx rate: %w", err)
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

func (r *Repository) Latest(ctx context.Context, tenantID, base, quote string) (*Rate, error) {
	var rt Rate
	err := r.pool.QueryRow(ctx, `
		SELECT id, tenant_id, base_currency, quote_currency, rate::float8,
		       effective_date::text, source, created_at
		FROM fx_rates
		WHERE tenant_id = $1 AND base_currency = $2 AND quote_currency = $3 AND effective_date <= CURRENT_DATE
		ORDER BY effective_date DESC LIMIT 1`, tenantID, base, quote).
		Scan(&rt.ID, &rt.TenantID, &rt.BaseCurrency, &rt.QuoteCurrency, &rt.Rate, &rt.EffectiveDate, &rt.Source, &rt.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query latest fx rate: %w", err)
	}
	return &rt, nil
}

func (r *Repository) Upsert(ctx context.Context, tenantID string, base, quote string, rate float64, effectiveDate, source string, createdBy *string) (*Rate, error) {
	if effectiveDate == "" {
		effectiveDate = time.Now().Format("2006-01-02")
	}
	var rt Rate
	err := r.pool.QueryRow(ctx, `
		INSERT INTO fx_rates (tenant_id, base_currency, quote_currency, rate, effective_date, source, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (tenant_id, base_currency, quote_currency, effective_date)
		DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source
		RETURNING id, tenant_id, base_currency, quote_currency, rate::float8,
		          effective_date::text, source, created_at`,
		tenantID, base, quote, rate, effectiveDate, source, createdBy).
		Scan(&rt.ID, &rt.TenantID, &rt.BaseCurrency, &rt.QuoteCurrency, &rt.Rate, &rt.EffectiveDate, &rt.Source, &rt.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert fx rate: %w", err)
	}
	return &rt, nil
}

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

func (s *Service) List(ctx context.Context, tenantID string) ([]Rate, error) {
	return s.repo.List(ctx, tenantID)
}

func (s *Service) Latest(ctx context.Context, tenantID, base, quote string) (*Rate, error) {
	return s.repo.Latest(ctx, tenantID, base, quote)
}

func (s *Service) Upsert(ctx context.Context, tenantID string, base, quote string, rate float64, effectiveDate, source string, createdBy *string) (*Rate, error) {
	if base == "" || quote == "" || rate <= 0 {
		return nil, fmt.Errorf("invalid fx rate: base, quote required and rate must be positive")
	}
	return s.repo.Upsert(ctx, tenantID, base, quote, rate, effectiveDate, source, createdBy)
}

// ConvertToBase converts amount (minor units) from source currency to base currency (IDR).
// Returns: base_amount_minor, exchange_rate, error.
// If source == base, returns amount as-is with rate 1.0.
func (s *Service) ConvertToBase(ctx context.Context, tenantID string, amountMinor int64, sourceCurrency, baseCurrency string) (int64, float64, error) {
	if sourceCurrency == baseCurrency {
		return amountMinor, 1.0, nil
	}
	rate, err := s.Latest(ctx, tenantID, sourceCurrency, baseCurrency)
	if err != nil {
		return 0, 0, err
	}
	if rate == nil {
		return 0, 0, fmt.Errorf("%w: %s/%s", ErrNoRate, sourceCurrency, baseCurrency)
	}
	baseAmount := float64(amountMinor) * rate.Rate
	return int64(baseAmount), rate.Rate, nil
}

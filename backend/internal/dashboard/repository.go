package dashboard

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type WarehouseStock struct {
	WarehouseID string `json:"warehouse_id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Lines       int64  `json:"lines"`
	UnitsOnHand int64  `json:"units_on_hand"`
	ValueMinor  int64  `json:"value_minor"`
}

type RecentMovement struct {
	MovementSeq   int64     `json:"movement_seq"`
	MovementType  string    `json:"movement_type"`
	ProductSKU    string    `json:"product_sku"`
	ProductName   string    `json:"product_name"`
	WarehouseCode string    `json:"warehouse_code"`
	Qty           int64     `json:"qty"`
	BalanceAfter  int64     `json:"balance_after"`
	CreatedAt     time.Time `json:"created_at"`
}

type Summary struct {
	InventoryValueMinor int64            `json:"inventory_value_minor"`
	UnitsOnHand         int64            `json:"units_on_hand"`
	SkuCount            int64            `json:"sku_count"`
	LowStockCount       int64            `json:"low_stock_count"`
	CustomerCount       int64            `json:"customer_count"`
	SupplierCount       int64            `json:"supplier_count"`
	Warehouses          []WarehouseStock `json:"warehouses"`
	RecentMovements     []RecentMovement `json:"recent_movements"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Summary aggregates real operational figures for the owner dashboard (R14 subset).
func (r *Repository) Summary(ctx context.Context, tenantID string) (*Summary, error) {
	out := &Summary{Warehouses: make([]WarehouseStock, 0), RecentMovements: make([]RecentMovement, 0)}

	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(sl.on_hand * sl.avg_cost_minor), 0),
		       COALESCE(SUM(sl.on_hand), 0),
		       COUNT(DISTINCT sl.product_id)
		FROM stock_levels sl
		WHERE sl.tenant_id = $1`, tenantID).
		Scan(&out.InventoryValueMinor, &out.UnitsOnHand, &out.SkuCount)
	if err != nil {
		return nil, fmt.Errorf("aggregate inventory: %w", err)
	}

	err = r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM stock_levels sl
		JOIN products p ON p.tenant_id = sl.tenant_id AND p.id = sl.product_id
		WHERE sl.tenant_id = $1 AND p.deleted_at IS NULL AND sl.on_hand < p.min_stock`, tenantID).
		Scan(&out.LowStockCount)
	if err != nil {
		return nil, fmt.Errorf("count low stock: %w", err)
	}

	err = r.pool.QueryRow(ctx, `
		SELECT (SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL),
		       (SELECT COUNT(*) FROM suppliers WHERE tenant_id = $1 AND deleted_at IS NULL)`, tenantID).
		Scan(&out.CustomerCount, &out.SupplierCount)
	if err != nil {
		return nil, fmt.Errorf("count partners: %w", err)
	}

	rows, err := r.pool.Query(ctx, `
		SELECT w.id, w.code, w.name, COUNT(sl.product_id),
		       COALESCE(SUM(sl.on_hand), 0), COALESCE(SUM(sl.on_hand * sl.avg_cost_minor), 0)
		FROM warehouses w
		LEFT JOIN stock_levels sl ON sl.tenant_id = w.tenant_id AND sl.warehouse_id = w.id
		WHERE w.tenant_id = $1
		GROUP BY w.id, w.code, w.name
		ORDER BY w.code`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("aggregate warehouses: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var ws WarehouseStock
		if err := rows.Scan(&ws.WarehouseID, &ws.Code, &ws.Name, &ws.Lines, &ws.UnitsOnHand, &ws.ValueMinor); err != nil {
			return nil, fmt.Errorf("scan warehouse stock: %w", err)
		}
		out.Warehouses = append(out.Warehouses, ws)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate warehouses: %w", err)
	}

	mrows, err := r.pool.Query(ctx, `
		SELECT m.movement_seq, m.movement_type, p.sku, p.name, w.code, m.qty, m.balance_after, m.created_at
		FROM inventory_movements m
		JOIN products   p ON p.tenant_id = m.tenant_id AND p.id = m.product_id
		JOIN warehouses w ON w.tenant_id = m.tenant_id AND w.id = m.warehouse_id
		WHERE m.tenant_id = $1
		ORDER BY m.movement_seq DESC
		LIMIT 8`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query recent movements: %w", err)
	}
	defer mrows.Close()
	for mrows.Next() {
		var mv RecentMovement
		if err := mrows.Scan(&mv.MovementSeq, &mv.MovementType, &mv.ProductSKU, &mv.ProductName,
			&mv.WarehouseCode, &mv.Qty, &mv.BalanceAfter, &mv.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan recent movement: %w", err)
		}
		out.RecentMovements = append(out.RecentMovements, mv)
	}
	if err := mrows.Err(); err != nil {
		return nil, fmt.Errorf("iterate recent movements: %w", err)
	}

	return out, nil
}

package inventory

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
	ErrStockInsufficient = errors.New("stock insufficient")
	ErrInvalidTransition = errors.New("illegal transition")
	ErrQtyInvalid        = errors.New("qty must be positive")
)

type StockLevel struct {
	TenantID        string    `json:"tenant_id"`
	ProductID       string    `json:"product_id"`
	WarehouseID     string    `json:"warehouse_id"`
	ProductName     string    `json:"product_name"`
	ProductSKU      string    `json:"product_sku"`
	WarehouseCode   string    `json:"warehouse_code"`
	UnitCode        string    `json:"unit_code"`
	OnHand          int64     `json:"on_hand"`
	Reserved        int64     `json:"reserved"`
	Available       int64     `json:"available"`
	AvgCostMinor    int64     `json:"avg_cost_minor"`
	StockValueMinor int64     `json:"stock_value_minor"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type Movement struct {
	ID            string    `json:"id"`
	TenantID      string    `json:"tenant_id"`
	MovementSeq   int64     `json:"movement_seq"`
	DocumentType  string    `json:"document_type"`
	DocumentID    string    `json:"document_id"`
	MovementType  string    `json:"movement_type"`
	ProductID     string    `json:"product_id"`
	ProductName   string    `json:"product_name"`
	ProductSKU    string    `json:"product_sku"`
	WarehouseID   string    `json:"warehouse_id"`
	WarehouseCode string    `json:"warehouse_code"`
	Qty           int64     `json:"qty"`
	UnitCostMinor int64     `json:"unit_cost_minor"`
	CogsMinor     *int64    `json:"cogs_minor"`
	BalanceAfter  int64     `json:"balance_after"`
	ActorUserID   string    `json:"actor_user_id"`
	CreatedAt     time.Time `json:"created_at"`
}

type AdjustmentInput struct {
	ProductID     string
	WarehouseID   string
	MovementType  string
	Qty           int64
	UnitCostMinor int64
	Reason        string
	ActorUserID   string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

// ListStockLevels returns current stock for every (product, warehouse) pair.
func (r *Repository) ListStockLevels(ctx context.Context, tenantID string) ([]StockLevel, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT sl.tenant_id, sl.product_id, sl.warehouse_id,
		       p.name, p.sku, w.code,
		       COALESCE(u.code, ''), sl.on_hand, sl.reserved,
		       sl.on_hand - sl.reserved, sl.avg_cost_minor,
		       sl.on_hand * sl.avg_cost_minor, sl.updated_at
		FROM stock_levels sl
		JOIN products   p ON p.tenant_id = sl.tenant_id AND p.id = sl.product_id
		JOIN warehouses w ON w.tenant_id = sl.tenant_id AND w.id = sl.warehouse_id
		LEFT JOIN units u ON u.tenant_id = p.tenant_id AND u.id = p.unit_id
		WHERE sl.tenant_id = $1
		ORDER BY w.code, p.sku`,
		tenantID)
	if err != nil {
		return nil, fmt.Errorf("query stock levels: %w", err)
	}
	defer rows.Close()

	out := make([]StockLevel, 0)
	for rows.Next() {
		var s StockLevel
		if err := rows.Scan(&s.TenantID, &s.ProductID, &s.WarehouseID,
			&s.ProductName, &s.ProductSKU, &s.WarehouseCode, &s.UnitCode,
			&s.OnHand, &s.Reserved, &s.Available, &s.AvgCostMinor,
			&s.StockValueMinor, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan stock level: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate stock levels: %w", err)
	}
	return out, nil
}

// ListMovements returns a cursor page of movements ordered by movement_seq desc.
func (r *Repository) ListMovements(ctx context.Context, tenantID string, productID, warehouseID *string, limit int, cursor *int64) ([]Movement, *int64, error) {
	query := `
		SELECT m.id, m.tenant_id, m.movement_seq, m.document_type, m.document_id,
		       m.movement_type, m.product_id, p.name, p.sku,
		       m.warehouse_id, w.code, m.qty, m.unit_cost_minor, m.cogs_minor,
		       m.balance_after, m.actor_user_id, m.created_at
		FROM inventory_movements m
		JOIN products   p ON p.tenant_id = m.tenant_id AND p.id = m.product_id
		JOIN warehouses w ON w.tenant_id = m.tenant_id AND w.id = m.warehouse_id
		WHERE m.tenant_id = $1`
	args := []any{tenantID}
	argIdx := 2
	if productID != nil {
		query += fmt.Sprintf(` AND m.product_id = $%d`, argIdx)
		args = append(args, *productID)
		argIdx++
	}
	if warehouseID != nil {
		query += fmt.Sprintf(` AND m.warehouse_id = $%d`, argIdx)
		args = append(args, *warehouseID)
		argIdx++
	}
	if cursor != nil {
		query += fmt.Sprintf(` AND m.movement_seq < $%d`, argIdx)
		args = append(args, *cursor)
		argIdx++
	}
	query += fmt.Sprintf(` ORDER BY m.movement_seq DESC LIMIT $%d`, argIdx)
	args = append(args, limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("query movements: %w", err)
	}
	defer rows.Close()

	movements := make([]Movement, 0, limit+1)
	for rows.Next() {
		var m Movement
		if err := rows.Scan(&m.ID, &m.TenantID, &m.MovementSeq, &m.DocumentType,
			&m.DocumentID, &m.MovementType, &m.ProductID, &m.ProductName,
			&m.ProductSKU, &m.WarehouseID, &m.WarehouseCode, &m.Qty,
			&m.UnitCostMinor, &m.CogsMinor, &m.BalanceAfter, &m.ActorUserID,
			&m.CreatedAt); err != nil {
			return nil, nil, fmt.Errorf("scan movement: %w", err)
		}
		movements = append(movements, m)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate movements: %w", err)
	}

	var nextCursor *int64
	if len(movements) > limit {
		movements = movements[:limit]
		last := movements[len(movements)-1].MovementSeq
		nextCursor = &last
	}
	return movements, nextCursor, nil
}

// RecordAdjustment writes an adjustment document, the stock mutation, and the
// immutable movement in one transaction; ADJ_IN recomputes moving average cost
// and ADJ_OUT guards (on_hand - reserved) >= qty with COGS at average cost.
func (r *Repository) RecordAdjustment(ctx context.Context, tenantID string, input AdjustmentInput) (*Movement, error) {
	var movement *Movement
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var onHand, reserved, avgCost int64
		err := tx.QueryRow(ctx, `
			SELECT on_hand, reserved, avg_cost_minor
			FROM stock_levels
			WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
			FOR UPDATE`,
			tenantID, input.ProductID, input.WarehouseID).
			Scan(&onHand, &reserved, &avgCost)
		if errors.Is(err, pgx.ErrNoRows) {
			if input.MovementType != "ADJ_IN" {
				return ErrStockInsufficient
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO stock_levels (tenant_id, product_id, warehouse_id)
				VALUES ($1, $2, $3)`,
				tenantID, input.ProductID, input.WarehouseID)
			if err != nil {
				return fmt.Errorf("create stock row: %w", err)
			}
			onHand, reserved, avgCost = 0, 0, 0
		} else if err != nil {
			return fmt.Errorf("read stock: %w", err)
		}

		var newOnHand, newAvgCost, unitCostMinor int64
		var cogsMinor *int64
		switch input.MovementType {
		case "ADJ_IN":
			newOnHand = onHand + input.Qty
			if newOnHand > 0 {
				newAvgCost = ((avgCost * onHand) + (input.UnitCostMinor * input.Qty)) / newOnHand
			} else {
				newAvgCost = avgCost
			}
			unitCostMinor = input.UnitCostMinor
		case "ADJ_OUT":
			if (onHand - reserved) < input.Qty {
				return ErrStockInsufficient
			}
			newOnHand = onHand - input.Qty
			newAvgCost = avgCost
			unitCostMinor = avgCost
			cogs := avgCost * input.Qty
			cogsMinor = &cogs
		default:
			return ErrInvalidTransition
		}

		_, err = tx.Exec(ctx, `
			UPDATE stock_levels
			SET on_hand = $3, avg_cost_minor = $4, updated_at = now()
			WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $5
			  AND on_hand = $6 AND reserved = $7`,
			tenantID, input.ProductID, newOnHand, newAvgCost, input.WarehouseID,
			onHand, reserved)
		if err != nil {
			return fmt.Errorf("update stock: %w", err)
		}

		adjNumber, err := r.codes.Next(ctx, tx, tenantID, "ADJ")
		if err != nil {
			return err
		}
		var adjID string
		err = tx.QueryRow(ctx, `
			INSERT INTO stock_adjustments (tenant_id, number, reason, created_by)
			VALUES ($1, $2, $3, $4) RETURNING id`,
			tenantID, adjNumber, input.Reason, input.ActorUserID).Scan(&adjID)
		if err != nil {
			return fmt.Errorf("insert adjustment document: %w", err)
		}

		var seq int64
		if err := tx.QueryRow(ctx, `SELECT nextval('movement_seq')`).Scan(&seq); err != nil {
			return fmt.Errorf("nextval movement_seq: %w", err)
		}

		var id string
		err = tx.QueryRow(ctx, `
			INSERT INTO inventory_movements (
				tenant_id, movement_seq, document_type, document_id, movement_type,
				product_id, warehouse_id, qty, unit_cost_minor, cogs_minor,
				balance_after, actor_user_id
			) VALUES ($1, $2, 'ADJ', $3, $4, $5, $6, $7, $8, $9, $10, $11)
			RETURNING id`,
			tenantID, seq, adjID, input.MovementType, input.ProductID,
			input.WarehouseID, input.Qty, unitCostMinor, cogsMinor,
			newOnHand, input.ActorUserID).Scan(&id)
		if err != nil {
			return fmt.Errorf("insert movement: %w", err)
		}

		movement = &Movement{
			ID:            id,
			TenantID:      tenantID,
			MovementSeq:   seq,
			DocumentType:  "ADJ",
			DocumentID:    adjID,
			MovementType:  input.MovementType,
			ProductID:     input.ProductID,
			WarehouseID:   input.WarehouseID,
			Qty:           input.Qty,
			UnitCostMinor: unitCostMinor,
			CogsMinor:     cogsMinor,
			BalanceAfter:  newOnHand,
			ActorUserID:   input.ActorUserID,
			CreatedAt:     time.Now(),
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return movement, nil
}

package sales

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
	ErrNotFound          = errors.New("sales document not found")
	ErrInvalidTransition = errors.New("illegal transition")
	ErrInsufficientStock = errors.New("available stock is insufficient")
	ErrInvoiceClosed     = errors.New("invoice is closed or paid")
	ErrOverpayment       = errors.New("payment amount exceeds invoice remaining")
	ErrInsufficientCash  = errors.New("cash account balance insufficient")
	ErrLinkedDocuments   = errors.New("cannot delete: document has linked transactions")
)

type SalesOrder struct {
	ID              string           `json:"id"`
	TenantID        string           `json:"tenant_id"`
	Number          string           `json:"number"`
	CustomerID      string           `json:"customer_id"`
	CustomerCode    string           `json:"customer_code"`
	CustomerName    string           `json:"customer_name"`
	WarehouseID     string           `json:"warehouse_id"`
	WarehouseCode   string           `json:"warehouse_code"`
	Status          string           `json:"status"`
	PriceList       string           `json:"price_list"`
	Note            string           `json:"note"`
	SubmittedAt     *time.Time       `json:"submitted_at"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
	TotalMinor      int64            `json:"total_minor"`
	Currency        string           `json:"currency"`
	ExchangeRate    float64          `json:"exchange_rate"`
	BaseAmountMinor int64            `json:"base_amount_minor"`
	Lines           []SalesOrderLine `json:"lines"`
	ApprovalStatus  string           `json:"approval_status"`
}

type SalesOrderLine struct {
	ID             string `json:"id"`
	SalesOrderID   string `json:"sales_order_id"`
	ProductID      string `json:"product_id"`
	ProductName    string `json:"product_name"`
	ProductSKU     string `json:"product_sku"`
	Quantity       int64  `json:"quantity"`
	UnitPriceMinor int64  `json:"unit_price_minor"`
	ReservedQty    int64  `json:"reserved_qty"`
	DeliveredQty   int64  `json:"delivered_qty"`
	CostMethod     string `json:"cost_method"`
}

type CustomerInvoice struct {
	ID           string                `json:"id"`
	TenantID     string                `json:"tenant_id"`
	Number       string                `json:"number"`
	CustomerID   string                `json:"customer_id"`
	CustomerCode string                `json:"customer_code"`
	CustomerName string                `json:"customer_name"`
	SalesOrderID *string               `json:"sales_order_id"`
	InvoiceDate  time.Time             `json:"invoice_date"`
	DueDate      *time.Time            `json:"due_date"`
	Status       string                `json:"status"`
	TotalMinor   int64                 `json:"total_minor"`
	PaidMinor    int64                 `json:"paid_minor"`
	Note         string                `json:"note"`
	CreatedAt    time.Time             `json:"created_at"`
	Lines        []CustomerInvoiceLine `json:"lines"`
}

type CustomerInvoiceLine struct {
	ID               string  `json:"id"`
	InvoiceID        string  `json:"invoice_id"`
	SalesOrderLineID *string `json:"sales_order_line_id"`
	ProductID        string  `json:"product_id"`
	ProductName      string  `json:"product_name"`
	ProductSKU       string  `json:"product_sku"`
	QtyInvoiced      int64   `json:"qty_invoiced"`
	UnitPriceMinor   int64   `json:"unit_price_minor"`
}

type CustomerReceipt struct {
	ID                 string    `json:"id"`
	TenantID           string    `json:"tenant_id"`
	Number             string    `json:"number"`
	CustomerInvoiceID  string    `json:"customer_invoice_id"`
	CustomerInvoiceNum string    `json:"customer_invoice_number"`
	CashAccountID      string    `json:"cash_account_id"`
	CashAccountName    string    `json:"cash_account_name"`
	AmountMinor        int64     `json:"amount_minor"`
	ReceiptDate        time.Time `json:"receipt_date"`
	PaymentMethod      string    `json:"payment_method"`
	Reference          string    `json:"reference"`
	Note               string    `json:"note"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
}

type CreateLineInput struct {
	ProductID      string
	Quantity       int64
	UnitPriceMinor int64
}

type CreateInput struct {
	CustomerID  string
	WarehouseID string
	Note        string
	Lines       []CreateLineInput
}

type UpdateInput struct {
	CustomerID  *string
	WarehouseID *string
	Note        *string
	Lines       []CreateLineInput
}

type CreateInvoiceLineInput struct {
	SalesOrderLineID *string
	ProductID        string
	QtyInvoiced      int64
	UnitPriceMinor   int64
}

type CreateCustomerInvoiceInput struct {
	CustomerID   string
	SalesOrderID *string
	DueDate      *string
	Note         string
	Lines        []CreateInvoiceLineInput
}

type RecordReceiptInput struct {
	CustomerInvoiceID string
	CashAccountID     string
	AmountMinor       int64
	ReceiptDate       *string
	PaymentMethod     string
	Reference         string
	Note              string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const soColumns = `so.id, so.tenant_id, so.number, so.customer_id, c.code, c.name,
	so.warehouse_id, w.code, so.status, so.price_list, so.note,
	so.submitted_at, so.created_at, so.updated_at`

const ciColumns = `ci.id, ci.tenant_id, ci.number, ci.customer_id, c.code, c.name,
	ci.sales_order_id, ci.invoice_date, ci.due_date, ci.status, ci.total_minor,
	ci.paid_minor, ci.note, ci.created_at`

func (r *Repository) Create(ctx context.Context, tenantID, actorID string, input CreateInput) (*SalesOrder, error) {
	var soID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "SO")
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO sales_orders (tenant_id, number, customer_id, warehouse_id, note, created_by)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`,
			tenantID, number, input.CustomerID, input.WarehouseID, input.Note, actorID).Scan(&soID)
		if err != nil {
			return fmt.Errorf("insert sales order: %w", err)
		}
		for _, line := range input.Lines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO sales_order_lines (tenant_id, sales_order_id, product_id, quantity, unit_price_minor)
				VALUES ($1, $2, $3, $4, $5)`,
				tenantID, soID, line.ProductID, line.Quantity, line.UnitPriceMinor); err != nil {
				return fmt.Errorf("insert sales order line: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, soID)
}

// CreateWithCurrency creates SO with multi-currency support.
// exchange_rate and base_amount_minor are stored in header.
func (r *Repository) CreateWithCurrency(ctx context.Context, tenantID, actorID string, input CreateInput, currency string, exchangeRate float64, baseAmountMinor int64) (*SalesOrder, error) {
	var soID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "SO")
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO sales_orders (tenant_id, number, customer_id, warehouse_id, note, created_by,
			                          currency, exchange_rate, base_amount_minor)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id`,
			tenantID, number, input.CustomerID, input.WarehouseID, input.Note, actorID,
			currency, exchangeRate, baseAmountMinor).Scan(&soID)
		if err != nil {
			return fmt.Errorf("insert sales order: %w", err)
		}
		for _, line := range input.Lines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO sales_order_lines (tenant_id, sales_order_id, product_id, quantity, unit_price_minor)
				VALUES ($1, $2, $3, $4, $5)`,
				tenantID, soID, line.ProductID, line.Quantity, line.UnitPriceMinor); err != nil {
				return fmt.Errorf("insert sales order line: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, soID)
}

func (r *Repository) Update(ctx context.Context, tenantID, id string, input UpdateInput) (*SalesOrder, error) {
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `
			SELECT status FROM sales_orders
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, id, tenantID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock sales order: %w", err)
		}
		if status != "draft" {
			return ErrInvalidTransition
		}

		if _, err := tx.Exec(ctx, `
			DELETE FROM sales_order_lines WHERE tenant_id = $1 AND sales_order_id = $2`,
			tenantID, id); err != nil {
			return fmt.Errorf("delete existing lines: %w", err)
		}
		for _, line := range input.Lines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO sales_order_lines (tenant_id, sales_order_id, product_id, quantity, unit_price_minor)
				VALUES ($1, $2, $3, $4, $5)`,
				tenantID, id, line.ProductID, line.Quantity, line.UnitPriceMinor); err != nil {
				return fmt.Errorf("insert updated line: %w", err)
			}
		}

		customerID := input.CustomerID
		warehouseID := input.WarehouseID
		note := input.Note
		_, err = tx.Exec(ctx, `
			UPDATE sales_orders
			SET customer_id = COALESCE($3, customer_id),
			    warehouse_id = COALESCE($4, warehouse_id),
			    note = COALESCE($5, note),
			    updated_at = now()
			WHERE id = $1 AND tenant_id = $2`, id, tenantID, customerID, warehouseID, note)
		if err != nil {
			return fmt.Errorf("update sales order header: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, id)
}

func (r *Repository) Delete(ctx context.Context, tenantID, id string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `
			SELECT status FROM sales_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			id, tenantID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock sales order: %w", err)
		}
		if status != "draft" {
			return ErrLinkedDocuments
		}
		if _, err := tx.Exec(ctx, `
			UPDATE sales_order_lines SET reserved_qty = 0
			WHERE tenant_id = $1 AND sales_order_id = $2`, tenantID, id); err != nil {
			return fmt.Errorf("reset reserved: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			DELETE FROM sales_order_lines WHERE tenant_id = $1 AND sales_order_id = $2`,
			tenantID, id); err != nil {
			return fmt.Errorf("delete lines: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			DELETE FROM sales_orders WHERE id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
			return fmt.Errorf("delete sales order: %w", err)
		}
		return nil
	})
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+soColumns+`,
		       (SELECT COALESCE(SUM(l.quantity * l.unit_price_minor), 0)
		        FROM sales_order_lines l WHERE l.tenant_id = so.tenant_id AND l.sales_order_id = so.id),
		       so.currency, so.exchange_rate, so.base_amount_minor
		FROM sales_orders so
		JOIN customers c ON c.tenant_id = so.tenant_id AND c.id = so.customer_id
		JOIN warehouses w ON w.tenant_id = so.tenant_id AND w.id = so.warehouse_id
		WHERE so.id = $1 AND so.tenant_id = $2`, id, tenantID)
	var so SalesOrder
	err := row.Scan(&so.ID, &so.TenantID, &so.Number, &so.CustomerID, &so.CustomerCode,
		&so.CustomerName, &so.WarehouseID, &so.WarehouseCode, &so.Status, &so.PriceList,
		&so.Note, &so.SubmittedAt, &so.CreatedAt, &so.UpdatedAt, &so.TotalMinor,
		&so.Currency, &so.ExchangeRate, &so.BaseAmountMinor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query sales order: %w", err)
	}
	so.Lines = make([]SalesOrderLine, 0)
	so.ApprovalStatus = "none"
	lines, err := r.linesFor(ctx, tenantID, []string{so.ID})
	if err != nil {
		return nil, err
	}
	so.Lines = lines[so.ID]
	return &so, nil
}

func (r *Repository) List(ctx context.Context, tenantID string) ([]SalesOrder, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+soColumns+`,
		       (SELECT COALESCE(SUM(l.quantity * l.unit_price_minor), 0)
		        FROM sales_order_lines l WHERE l.tenant_id = so.tenant_id AND l.sales_order_id = so.id),
		       so.currency, so.exchange_rate, so.base_amount_minor
		FROM sales_orders so
		JOIN customers c ON c.tenant_id = so.tenant_id AND c.id = so.customer_id
		JOIN warehouses w ON w.tenant_id = so.tenant_id AND w.id = so.warehouse_id
		WHERE so.tenant_id = $1
		ORDER BY so.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query sales orders: %w", err)
	}
	defer rows.Close()
	list := make([]SalesOrder, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var so SalesOrder
		if err := rows.Scan(&so.ID, &so.TenantID, &so.Number, &so.CustomerID, &so.CustomerCode,
			&so.CustomerName, &so.WarehouseID, &so.WarehouseCode, &so.Status, &so.PriceList,
			&so.Note, &so.SubmittedAt, &so.CreatedAt, &so.UpdatedAt, &so.TotalMinor,
			&so.Currency, &so.ExchangeRate, &so.BaseAmountMinor); err != nil {
			return nil, fmt.Errorf("scan sales order: %w", err)
		}
		so.Lines = make([]SalesOrderLine, 0)
		so.ApprovalStatus = "none"
		list = append(list, so)
		ids = append(ids, so.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sales orders: %w", err)
	}
	if len(ids) == 0 {
		return list, nil
	}
	linesBySO, err := r.linesFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Lines = linesBySO[list[i].ID]
	}
	return list, nil
}

func (r *Repository) linesFor(ctx context.Context, tenantID string, soIDs []string) (map[string][]SalesOrderLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.sales_order_id, l.id, l.product_id, p.name, p.sku,
		       l.quantity, l.unit_price_minor, l.reserved_qty, l.delivered_qty, p.cost_method
		FROM sales_order_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.sales_order_id = ANY($2)
		ORDER BY l.id`, tenantID, soIDs)
	if err != nil {
		return nil, fmt.Errorf("query sales order lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]SalesOrderLine)
	for rows.Next() {
		var soID string
		var l SalesOrderLine
		if err := rows.Scan(&soID, &l.ID, &l.ProductID, &l.ProductName, &l.ProductSKU,
			&l.Quantity, &l.UnitPriceMinor, &l.ReservedQty, &l.DeliveredQty, &l.CostMethod); err != nil {
			return nil, fmt.Errorf("scan sales order line: %w", err)
		}
		l.SalesOrderID = soID
		out[soID] = append(out[soID], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate sales order lines: %w", err)
	}
	return out, nil
}

func (r *Repository) Submit(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	var soID string
	err := r.pool.QueryRow(ctx, `
		UPDATE sales_orders
		SET status = 'submitted', submitted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
		RETURNING id`, id, tenantID).Scan(&soID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrInvalidTransition
	}
	if err != nil {
		return nil, fmt.Errorf("submit sales order: %w", err)
	}
	return r.GetByID(ctx, tenantID, soID)
}

func (r *Repository) Checkout(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	var insufficient []string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, warehouseID string
		err := tx.QueryRow(ctx, `
			SELECT status, warehouse_id FROM sales_orders
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, id, tenantID).Scan(&status, &warehouseID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock sales order: %w", err)
		}
		if status != "submitted" {
			return ErrInvalidTransition
		}

		rows, err := tx.Query(ctx, `
			SELECT l.id, l.product_id, l.quantity, l.reserved_qty, p.name, p.sku
			FROM sales_order_lines l
			JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
			WHERE l.sales_order_id = $1 AND l.tenant_id = $2 FOR UPDATE`, id, tenantID)
		if err != nil {
			return fmt.Errorf("lock sales order lines: %w", err)
		}
		type line struct {
			id, productID, name, sku string
			qty, reserved            int64
		}
		lines := make([]line, 0)
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.id, &l.productID, &l.qty, &l.reserved, &l.name, &l.sku); err != nil {
				rows.Close()
				return fmt.Errorf("scan line: %w", err)
			}
			lines = append(lines, l)
		}
		rows.Close()

		insufficient = insufficient[:0]
		for _, l := range lines {
			if l.reserved >= l.qty {
				continue
			}
			need := l.qty - l.reserved
			var onHand, reserved int64
			err := tx.QueryRow(ctx, `
				SELECT on_hand, reserved FROM stock_levels
				WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE`,
				tenantID, l.productID, warehouseID).Scan(&onHand, &reserved)
			if errors.Is(err, pgx.ErrNoRows) {
				onHand, reserved = 0, 0
			} else if err != nil {
				return fmt.Errorf("lock stock level: %w", err)
			}
			available := onHand - reserved
			if available < need {
				insufficient = append(insufficient, fmt.Sprintf("%s (%s): butuh %d, tersedia %d", l.name, l.sku, need, available))
				continue
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO stock_levels (tenant_id, product_id, warehouse_id, on_hand, reserved)
				VALUES ($1, $2, $3, 0, $4)
				ON CONFLICT (tenant_id, product_id, warehouse_id) DO UPDATE
				SET reserved = stock_levels.reserved + EXCLUDED.reserved, updated_at = now()`,
				tenantID, l.productID, warehouseID, need); err != nil {
				return fmt.Errorf("reserve stock: %w", err)
			}
			if _, err := tx.Exec(ctx, `
				UPDATE sales_order_lines SET reserved_qty = quantity
				WHERE id = $1 AND tenant_id = $2`, l.id, tenantID); err != nil {
				return fmt.Errorf("update line reserved: %w", err)
			}
		}

		if len(insufficient) > 0 {
			return fmt.Errorf("%w: %s", ErrInsufficientStock, joinStrings(insufficient))
		}

		if _, err := tx.Exec(ctx, `
			UPDATE sales_orders SET status = 'reserved', updated_at = now()
			WHERE id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
			return fmt.Errorf("flip status reserved: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, id)
}

func joinStrings(ss []string) string {
	out := ""
	for i, s := range ss {
		if i > 0 {
			out += "; "
		}
		out += s
	}
	return out
}

func (r *Repository) Deliver(ctx context.Context, tenantID, id, actorID string) (*SalesOrder, error) {
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, warehouseID string
		err := tx.QueryRow(ctx, `
			SELECT status, warehouse_id FROM sales_orders
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, id, tenantID).Scan(&status, &warehouseID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock sales order: %w", err)
		}
		if status != "reserved" {
			return ErrInvalidTransition
		}

		rows, err := tx.Query(ctx, `
			SELECT l.id, l.product_id, l.quantity, l.reserved_qty, l.delivered_qty, p.cost_method
			FROM sales_order_lines l
			JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
			WHERE l.sales_order_id = $1 AND l.tenant_id = $2 FOR UPDATE`, id, tenantID)
		if err != nil {
			return fmt.Errorf("lock lines: %w", err)
		}
		type line struct {
			id, productID, costMethod string
			qty, reserved, delivered  int64
		}
		lines := make([]line, 0)
		for rows.Next() {
			var l line
			if err := rows.Scan(&l.id, &l.productID, &l.qty, &l.reserved, &l.delivered, &l.costMethod); err != nil {
				rows.Close()
				return fmt.Errorf("scan line: %w", err)
			}
			lines = append(lines, l)
		}
		rows.Close()

		for _, l := range lines {
			need := l.qty - l.delivered
			if need <= 0 {
				continue
			}
			if l.reserved < need {
				return ErrInvalidTransition
			}
			var onHand, reserved, avgCost int64
			err := tx.QueryRow(ctx, `
				SELECT on_hand, reserved, avg_cost_minor FROM stock_levels
				WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 FOR UPDATE`,
				tenantID, l.productID, warehouseID).Scan(&onHand, &reserved, &avgCost)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrInsufficientStock
			}
			if err != nil {
				return fmt.Errorf("lock stock level: %w", err)
			}
			if onHand < need || reserved < need {
				return ErrInsufficientStock
			}

			var cogs int64
			if l.costMethod == "fifo" {
				remaining := need
				layers, err := tx.Query(ctx, `
					SELECT id, qty_remaining, unit_cost_minor FROM inventory_cost_layers
					WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3 AND qty_remaining > 0
					ORDER BY source_movement_seq FOR UPDATE`, tenantID, l.productID, warehouseID)
				if err != nil {
					return fmt.Errorf("lock fifo layers: %w", err)
				}
				type layer struct {
					id   string
					rem  int64
					cost int64
				}
				ls := make([]layer, 0)
				for layers.Next() {
					var ly layer
					if err := layers.Scan(&ly.id, &ly.rem, &ly.cost); err != nil {
						layers.Close()
						return fmt.Errorf("scan layer: %w", err)
					}
					ls = append(ls, ly)
				}
				layers.Close()
				for _, ly := range ls {
					if remaining <= 0 {
						break
					}
					take := ly.rem
					if take > remaining {
						take = remaining
					}
					cogs += take * ly.cost
					remaining -= take
					if take > 0 {
						if _, err := tx.Exec(ctx, `UPDATE inventory_cost_layers SET qty_remaining = qty_remaining - $1 WHERE id = $2`, take, ly.id); err != nil {
							return fmt.Errorf("deplete layer: %w", err)
						}
					}
				}
				if remaining > 0 {
					cogs += remaining * avgCost
				}
			} else {
				cogs = need * avgCost
			}

			tag, err := tx.Exec(ctx, `
				UPDATE stock_levels
				SET on_hand = on_hand - $4, reserved = reserved - $4, updated_at = now()
				WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
				  AND on_hand >= $4 AND reserved >= $4`,
				tenantID, l.productID, warehouseID, need)
			if err != nil {
				return fmt.Errorf("decrement stock: %w", err)
			}
			if tag.RowsAffected() == 0 {
				return ErrInsufficientStock
			}

			var seq int64
			if err := tx.QueryRow(ctx, `SELECT nextval('movement.seq')`).Scan(&seq); err != nil {
				if err := tx.QueryRow(ctx, `SELECT nextval('movement_seq')`).Scan(&seq); err != nil {
					return fmt.Errorf("next movement seq: %w", err)
				}
			}
			balanceAfter := onHand - need
			if _, err := tx.Exec(ctx, `
				INSERT INTO inventory_movements (
					tenant_id, movement_seq, document_type, document_id, movement_type,
					product_id, warehouse_id, qty, unit_cost_minor, cogs_minor, balance_after, actor_user_id
				) VALUES ($1, $2, 'DO', $3, 'OUT', $4, $5, $6, $7, $8, $9, $10)`,
				tenantID, seq, id, l.productID, warehouseID, need, avgCost, cogs, balanceAfter, actorID); err != nil {
				return fmt.Errorf("insert out movement: %w", err)
			}

			if _, err := tx.Exec(ctx, `UPDATE sales_order_lines SET delivered_qty = quantity WHERE id = $1 AND tenant_id = $2`, l.id, tenantID); err != nil {
				return fmt.Errorf("mark line delivered: %w", err)
			}
		}

		if _, err := tx.Exec(ctx, `UPDATE sales_orders SET status = 'delivered', updated_at = now() WHERE id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
			return fmt.Errorf("flip status delivered: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, id)
}

func (r *Repository) Cancel(ctx context.Context, tenantID, id string) (*SalesOrder, error) {
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, warehouseID string
		err := tx.QueryRow(ctx, `
			SELECT status, warehouse_id FROM sales_orders
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, id, tenantID).Scan(&status, &warehouseID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock sales order: %w", err)
		}
		if status != "draft" && status != "submitted" && status != "reserved" {
			return ErrInvalidTransition
		}

		if status == "reserved" {
			rows, err := tx.Query(ctx, `
				SELECT product_id, reserved_qty FROM sales_order_lines
				WHERE sales_order_id = $1 AND tenant_id = $2 AND reserved_qty > 0 FOR UPDATE`, id, tenantID)
			if err != nil {
				return fmt.Errorf("lock reserved lines: %w", err)
			}
			type line struct {
				productID string
				reserved  int64
			}
			lines := make([]line, 0)
			for rows.Next() {
				var l line
				if err := rows.Scan(&l.productID, &l.reserved); err != nil {
					rows.Close()
					return fmt.Errorf("scan reserved line: %w", err)
				}
				lines = append(lines, l)
			}
			rows.Close()

			for _, l := range lines {
				if _, err := tx.Exec(ctx, `
					UPDATE stock_levels
					SET reserved = GREATEST(0, reserved - $4), updated_at = now()
					WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3`,
					tenantID, l.productID, warehouseID, l.reserved); err != nil {
					return fmt.Errorf("release reservation: %w", err)
				}
			}
			if _, err := tx.Exec(ctx, `
				UPDATE sales_order_lines SET reserved_qty = 0
				WHERE sales_order_id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
				return fmt.Errorf("reset line reserved: %w", err)
			}
		}

		if _, err := tx.Exec(ctx, `
			UPDATE sales_orders SET status = 'cancelled', cancelled_at = now(), updated_at = now()
			WHERE id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
			return fmt.Errorf("cancel sales order: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, id)
}

// FinalizeByApproval updates SO status when the linked approval settles.
func (r *Repository) FinalizeByApproval(ctx context.Context, tenantID, id, status, actorID string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var current string
		err := tx.QueryRow(ctx, `
			SELECT status FROM sales_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			id, tenantID).Scan(&current)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if current != "submitted" {
			return nil
		}
		switch status {
		case "rejected":
			rows, err := tx.Query(ctx, `
				SELECT l.product_id, l.reserved_qty, so.warehouse_id
				FROM sales_order_lines l
				JOIN sales_orders so ON so.id = l.sales_order_id AND so.tenant_id = l.tenant_id
				WHERE l.sales_order_id = $1 AND l.tenant_id = $2 AND l.reserved_qty > 0
				FOR UPDATE`, id, tenantID)
			if err != nil {
				return err
			}
			type rel struct {
				pid, wid string
				qty      int64
			}
			var releases []rel
			for rows.Next() {
				var x rel
				if err := rows.Scan(&x.pid, &x.qty, &x.wid); err == nil {
					releases = append(releases, x)
				}
			}
			rows.Close()
			for _, x := range releases {
				_, _ = tx.Exec(ctx, `
					UPDATE stock_levels SET reserved = GREATEST(0, reserved - $1), updated_at = now()
					WHERE tenant_id = $2 AND product_id = $3 AND warehouse_id = $4`,
					x.qty, tenantID, x.pid, x.wid)
			}
			_, _ = tx.Exec(ctx, `
				UPDATE sales_order_lines SET reserved_qty = 0
				WHERE sales_order_id = $1 AND tenant_id = $2`, id, tenantID)
			_, err = tx.Exec(ctx, `
				UPDATE sales_orders SET status = 'cancelled', cancelled_at = now(), updated_at = now()
				WHERE id = $1 AND tenant_id = $2`, id, tenantID)
			return err
		case "approved":
			_, err := tx.Exec(ctx, `
				UPDATE sales_orders SET updated_at = now() WHERE id = $1 AND tenant_id = $2`, id, tenantID)
			return err
		}
		return nil
	})
}

func (r *Repository) CreateCustomerInvoice(ctx context.Context, tenantID, actorID string, input CreateCustomerInvoiceInput) (*CustomerInvoice, error) {
	var invID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "CINV")
		if err != nil {
			return err
		}
		total := int64(0)
		for _, l := range input.Lines {
			total += l.QtyInvoiced * l.UnitPriceMinor
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO customer_invoices (
				tenant_id, number, customer_id, sales_order_id, due_date, status,
				total_minor, paid_minor, note, created_by
			) VALUES ($1, $2, $3, $4, $5, 'open', $6, 0, $7, $8)
			RETURNING id`,
			tenantID, number, input.CustomerID, input.SalesOrderID, input.DueDate,
			total, input.Note, actorID).Scan(&invID)
		if err != nil {
			return fmt.Errorf("insert customer invoice: %w", err)
		}
		for _, l := range input.Lines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO customer_invoice_lines (
					tenant_id, invoice_id, sales_order_line_id, product_id, qty_invoiced, unit_price_minor
				) VALUES ($1, $2, $3, $4, $5, $6)`,
				tenantID, invID, l.SalesOrderLineID, l.ProductID, l.QtyInvoiced, l.UnitPriceMinor); err != nil {
				return fmt.Errorf("insert customer invoice line: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE customers SET open_exposure_minor = open_exposure_minor + $1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, total, input.CustomerID, tenantID); err != nil {
			return fmt.Errorf("bump customer exposure: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetCustomerInvoice(ctx, tenantID, invID)
}

// CreateCustomerInvoiceWithCurrency stores currency + exchange_rate + base_amount_minor.
func (r *Repository) CreateCustomerInvoiceWithCurrency(ctx context.Context, tenantID, actorID string, input CreateCustomerInvoiceInput, currency string, exchangeRate float64, baseAmountMinor int64) (*CustomerInvoice, error) {
	var invID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "CINV")
		if err != nil {
			return err
		}
		total := int64(0)
		for _, l := range input.Lines {
			total += l.QtyInvoiced * l.UnitPriceMinor
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO customer_invoices (
				tenant_id, number, customer_id, sales_order_id, due_date, status,
				total_minor, paid_minor, note, created_by, currency, exchange_rate, base_amount_minor
			) VALUES ($1, $2, $3, $4, $5, 'open', $6, 0, $7, $8, $9, $10, $11)
			RETURNING id`,
			tenantID, number, input.CustomerID, input.SalesOrderID, input.DueDate,
			total, input.Note, actorID, currency, exchangeRate, baseAmountMinor).Scan(&invID)
		if err != nil {
			return fmt.Errorf("insert customer invoice: %w", err)
		}
		for _, l := range input.Lines {
			if _, err := tx.Exec(ctx, `
				INSERT INTO customer_invoice_lines (
					tenant_id, invoice_id, sales_order_line_id, product_id, qty_invoiced, unit_price_minor
				) VALUES ($1, $2, $3, $4, $5, $6)`,
				tenantID, invID, l.SalesOrderLineID, l.ProductID, l.QtyInvoiced, l.UnitPriceMinor); err != nil {
				return fmt.Errorf("insert customer invoice line: %w", err)
			}
		}
		if _, err := tx.Exec(ctx, `
			UPDATE customers SET open_exposure_minor = open_exposure_minor + $1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, baseAmountMinor, input.CustomerID, tenantID); err != nil {
			return fmt.Errorf("bump customer exposure: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetCustomerInvoice(ctx, tenantID, invID)
}

func (r *Repository) GetCustomerInvoice(ctx context.Context, tenantID, id string) (*CustomerInvoice, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+ciColumns+`
		FROM customer_invoices ci
		JOIN customers c ON c.tenant_id = ci.tenant_id AND c.id = ci.customer_id
		WHERE ci.id = $1 AND ci.tenant_id = $2`, id, tenantID)
	var ci CustomerInvoice
	if err := row.Scan(&ci.ID, &ci.TenantID, &ci.Number, &ci.CustomerID, &ci.CustomerCode,
		&ci.CustomerName, &ci.SalesOrderID, &ci.InvoiceDate, &ci.DueDate, &ci.Status,
		&ci.TotalMinor, &ci.PaidMinor, &ci.Note, &ci.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query customer invoice: %w", err)
	}
	ci.Lines = make([]CustomerInvoiceLine, 0)
	lines, err := r.ciLinesFor(ctx, tenantID, []string{ci.ID})
	if err != nil {
		return nil, err
	}
	ci.Lines = lines[ci.ID]
	return &ci, nil
}

func (r *Repository) ListCustomerInvoices(ctx context.Context, tenantID string) ([]CustomerInvoice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+ciColumns+`
		FROM customer_invoices ci
		JOIN customers c ON c.tenant_id = ci.tenant_id AND c.id = ci.customer_id
		WHERE ci.tenant_id = $1
		ORDER BY ci.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query customer invoices: %w", err)
	}
	defer rows.Close()
	list := make([]CustomerInvoice, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var ci CustomerInvoice
		if err := rows.Scan(&ci.ID, &ci.TenantID, &ci.Number, &ci.CustomerID, &ci.CustomerCode,
			&ci.CustomerName, &ci.SalesOrderID, &ci.InvoiceDate, &ci.DueDate, &ci.Status,
			&ci.TotalMinor, &ci.PaidMinor, &ci.Note, &ci.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan customer invoice: %w", err)
		}
		ci.Lines = make([]CustomerInvoiceLine, 0)
		list = append(list, ci)
		ids = append(ids, ci.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate customer invoices: %w", err)
	}
	if len(ids) == 0 {
		return list, nil
	}
	linesByInv, err := r.ciLinesFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Lines = linesByInv[list[i].ID]
	}
	return list, nil
}

func (r *Repository) ciLinesFor(ctx context.Context, tenantID string, invIDs []string) (map[string][]CustomerInvoiceLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.invoice_id, l.id, l.sales_order_line_id, l.product_id, p.name, p.sku,
		       l.qty_invoiced, l.unit_price_minor
		FROM customer_invoice_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.invoice_id = ANY($2)
		ORDER BY l.id`, tenantID, invIDs)
	if err != nil {
		return nil, fmt.Errorf("query customer invoice lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]CustomerInvoiceLine)
	for rows.Next() {
		var invID string
		var l CustomerInvoiceLine
		if err := rows.Scan(&invID, &l.ID, &l.SalesOrderLineID, &l.ProductID, &l.ProductName,
			&l.ProductSKU, &l.QtyInvoiced, &l.UnitPriceMinor); err != nil {
			return nil, fmt.Errorf("scan customer invoice line: %w", err)
		}
		l.InvoiceID = invID
		out[invID] = append(out[invID], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate customer invoice lines: %w", err)
	}
	return out, nil
}

func (r *Repository) RecordCustomerReceipt(ctx context.Context, tenantID, actorID string, input RecordReceiptInput) (*CustomerReceipt, error) {
	var receiptID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, customerID string
		var totalMinor, paidMinor int64
		err := tx.QueryRow(ctx, `
			SELECT status, total_minor, paid_minor, customer_id
			FROM customer_invoices
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			input.CustomerInvoiceID, tenantID).Scan(&status, &totalMinor, &paidMinor, &customerID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock customer invoice: %w", err)
		}
		if status == "paid" || status == "cancelled" {
			return ErrInvoiceClosed
		}
		remaining := totalMinor - paidMinor
		if input.AmountMinor > remaining {
			return ErrOverpayment
		}

		var accActive bool
		var accName string
		err = tx.QueryRow(ctx, `
			SELECT is_active, name FROM cash_accounts
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			input.CashAccountID, tenantID).Scan(&accActive, &accName)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock cash account: %w", err)
		}
		if !accActive {
			return ErrInvoiceClosed
		}

		number, err := r.codes.Next(ctx, tx, tenantID, "RCPT")
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `
			INSERT INTO customer_receipts (
				tenant_id, number, customer_invoice_id, cash_account_id, amount_minor,
				receipt_date, payment_method, reference, note, recorded_by
			) VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $9, $10)
			RETURNING id`,
			tenantID, number, input.CustomerInvoiceID, input.CashAccountID,
			input.AmountMinor, input.ReceiptDate, input.PaymentMethod,
			input.Reference, input.Note, actorID).Scan(&receiptID)
		if err != nil {
			return fmt.Errorf("insert customer receipt: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE cash_accounts SET balance_minor = balance_minor + $1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, input.AmountMinor, input.CashAccountID, tenantID); err != nil {
			return fmt.Errorf("increase cash balance: %w", err)
		}

		newPaid := paidMinor + input.AmountMinor
		newStatus := "partial"
		if newPaid == totalMinor {
			newStatus = "paid"
		}
		if _, err := tx.Exec(ctx, `
			UPDATE customer_invoices SET paid_minor = $1, status = $2, updated_at = now()
			WHERE id = $3 AND tenant_id = $4`, newPaid, newStatus, input.CustomerInvoiceID, tenantID); err != nil {
			return fmt.Errorf("update customer invoice: %w", err)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE customers
			SET open_exposure_minor = GREATEST(0, open_exposure_minor - $1), updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, input.AmountMinor, customerID, tenantID); err != nil {
			return fmt.Errorf("reduce customer exposure: %w", err)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetCustomerReceipt(ctx, tenantID, receiptID)
}

func (r *Repository) ListCustomerReceipts(ctx context.Context, tenantID string) ([]CustomerReceipt, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.tenant_id, p.number, p.customer_invoice_id, ci.number,
		       p.cash_account_id, ca.name, p.amount_minor, p.receipt_date,
		       p.payment_method, p.reference, p.note, p.status, p.created_at
		FROM customer_receipts p
		JOIN customer_invoices ci ON ci.tenant_id = p.tenant_id AND ci.id = p.customer_invoice_id
		JOIN cash_accounts ca ON ca.tenant_id = p.tenant_id AND ca.id = p.cash_account_id
		WHERE p.tenant_id = $1
		ORDER BY p.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query customer receipts: %w", err)
	}
	defer rows.Close()
	list := make([]CustomerReceipt, 0)
	for rows.Next() {
		var p CustomerReceipt
		if err := rows.Scan(&p.ID, &p.TenantID, &p.Number, &p.CustomerInvoiceID, &p.CustomerInvoiceNum,
			&p.CashAccountID, &p.CashAccountName, &p.AmountMinor, &p.ReceiptDate,
			&p.PaymentMethod, &p.Reference, &p.Note, &p.Status, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan customer receipt: %w", err)
		}
		list = append(list, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate customer receipts: %w", err)
	}
	return list, nil
}

func (r *Repository) GetCustomerReceipt(ctx context.Context, tenantID, id string) (*CustomerReceipt, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, p.tenant_id, p.number, p.customer_invoice_id, ci.number,
		       p.cash_account_id, ca.name, p.amount_minor, p.receipt_date,
		       p.payment_method, p.reference, p.note, p.status, p.created_at
		FROM customer_receipts p
		JOIN customer_invoices ci ON ci.tenant_id = p.tenant_id AND ci.id = p.customer_invoice_id
		JOIN cash_accounts ca ON ca.tenant_id = p.tenant_id AND ca.id = p.cash_account_id
		WHERE p.id = $1 AND p.tenant_id = $2`, id, tenantID)
	var p CustomerReceipt
	err := row.Scan(&p.ID, &p.TenantID, &p.Number, &p.CustomerInvoiceID, &p.CustomerInvoiceNum,
		&p.CashAccountID, &p.CashAccountName, &p.AmountMinor, &p.ReceiptDate,
		&p.PaymentMethod, &p.Reference, &p.Note, &p.Status, &p.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query customer receipt: %w", err)
	}
	return &p, nil
}

package purchasing

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
	ErrNotFound          = errors.New("purchase document not found")
	ErrInvalidTransition = errors.New("illegal transition")
	ErrLineExhausted     = errors.New("line quantity exhausted")
	ErrQtyExceeded       = errors.New("received qty exceeds remaining")
)

type PurchaseRequest struct {
	ID              string                `json:"id"`
	TenantID        string                `json:"tenant_id"`
	Number          string                `json:"number"`
	RequesterID     string                `json:"requester_id"`
	CostCenter      *string               `json:"cost_center"`
	Reason          string                `json:"reason"`
	Status          string                `json:"status"`
	SubmittedAt     *time.Time            `json:"submitted_at"`
	ApprovedAt      *time.Time            `json:"approved_at"`
	RejectedAt      *time.Time            `json:"rejected_at"`
	ConvertedAt     *time.Time            `json:"converted_at"`
	CompletedAt     *time.Time            `json:"completed_at"`
	CancelledAt     *time.Time            `json:"cancelled_at"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	TotalMinor      int64                 `json:"total_minor"`
	Currency        string                `json:"currency"`
	ExchangeRate    float64               `json:"exchange_rate"`
	BaseAmountMinor int64                 `json:"base_amount_minor"`
	Lines           []PurchaseRequestLine `json:"lines"`
	ApprovalStatus  string                `json:"approval_status"`
}

type PurchaseRequestLine struct {
	ID                  string  `json:"id"`
	PurchaseRequestID   string  `json:"purchase_request_id"`
	ProductID           string  `json:"product_id"`
	ProductName         string  `json:"product_name"`
	ProductSKU          string  `json:"product_sku"`
	Quantity            int64   `json:"quantity"`
	EstimatedPriceMinor int64   `json:"estimated_price_minor"`
	Note                *string `json:"note"`
	ConvertedQty        int64   `json:"converted_qty"`
}

type PurchaseOrder struct {
	ID                string              `json:"id"`
	TenantID          string              `json:"tenant_id"`
	Number            string              `json:"number"`
	PurchaseRequestID *string             `json:"purchase_request_id"`
	SupplierID        string              `json:"supplier_id"`
	SupplierCode      string              `json:"supplier_code"`
	WarehouseID       string              `json:"warehouse_id"`
	WarehouseCode     string              `json:"warehouse_code"`
	Terms             string              `json:"terms"`
	ExpectedDate      *time.Time          `json:"expected_date"`
	Status            string              `json:"status"`
	IssuedAt          *time.Time          `json:"issued_at"`
	ClosedAt          *time.Time          `json:"closed_at"`
	CreatedAt         time.Time           `json:"created_at"`
	UpdatedAt         time.Time           `json:"updated_at"`
	TotalMinor        int64               `json:"total_minor"`
	Lines             []PurchaseOrderLine `json:"lines"`
}

type PurchaseOrderLine struct {
	ID                  string  `json:"id"`
	PurchaseOrderID     string  `json:"purchase_order_id"`
	PurchaseRequestLine *string `json:"purchase_request_line_id"`
	ProductID           string  `json:"product_id"`
	ProductName         string  `json:"product_name"`
	ProductSKU          string  `json:"product_sku"`
	QtyOrdered          int64   `json:"qty_ordered"`
	AllowedQty          int64   `json:"allowed_qty"`
	ReceivedQty         int64   `json:"received_qty"`
	UnitPriceMinor      int64   `json:"unit_price_minor"`
}

type GoodsReceipt struct {
	ID               string             `json:"id"`
	TenantID         string             `json:"tenant_id"`
	Number           string             `json:"number"`
	PurchaseOrderID  string             `json:"purchase_order_id"`
	PurchaseOrderNum string             `json:"purchase_order_number"`
	WarehouseID      string             `json:"warehouse_id"`
	WarehouseCode    string             `json:"warehouse_code"`
	Note             string             `json:"note"`
	ReceivedBy       string             `json:"received_by"`
	ReceivedAt       time.Time          `json:"received_at"`
	CreatedAt        time.Time          `json:"created_at"`
	TotalValueMinor  int64              `json:"total_value_minor"`
	Lines            []GoodsReceiptLine `json:"lines"`
}

type GoodsReceiptLine struct {
	ID                  string  `json:"id"`
	GoodsReceiptID      string  `json:"goods_receipt_id"`
	PurchaseOrderLineID string  `json:"purchase_order_line_id"`
	ProductID           string  `json:"product_id"`
	ProductName         string  `json:"product_name"`
	ProductSKU          string  `json:"product_sku"`
	QtyReceived         int64   `json:"qty_received"`
	UnitCostMinor       int64   `json:"unit_cost_minor"`
	DiscrepancyNote     *string `json:"discrepancy_note"`
}

type CreatePurchaseRequestInput struct {
	CostCenter *string
	Reason     string
	Lines      []CreatePurchaseRequestLineInput
}

type CreatePurchaseRequestLineInput struct {
	ProductID           string
	Quantity            int64
	EstimatedPriceMinor int64
	Note                *string
}

type ConvertPRLineInput struct {
	PurchaseRequestLineID string
	Quantity              int64
	UnitPriceMinor        int64
}

type ConvertPRInput struct {
	SupplierID   string
	WarehouseID  string
	ExpectedDate *string
	Lines        []ConvertPRLineInput
}

type RecordGRInput struct {
	PurchaseOrderID string
	WarehouseID     string
	Note            string
	Lines           []RecordGRLineInput
}

type RecordGRLineInput struct {
	PurchaseOrderLineID string
	QtyReceived         int64
	UnitCostMinor       int64
	DiscrepancyNote     *string
}

type Repository struct {
	pool  *pgxpool.Pool
	codes *codes.Allocator
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool, codes: codes.NewAllocator(pool)}
}

const prColumns = `id, tenant_id, number, requester_id, cost_center, reason, status,
	submitted_at, approved_at, rejected_at, converted_at, completed_at, cancelled_at,
	created_at, updated_at`

func scanPurchaseRequest(row interface{ Scan(...any) error }) (*PurchaseRequest, error) {
	var pr PurchaseRequest
	err := row.Scan(&pr.ID, &pr.TenantID, &pr.Number, &pr.RequesterID, &pr.CostCenter,
		&pr.Reason, &pr.Status, &pr.SubmittedAt, &pr.ApprovedAt, &pr.RejectedAt,
		&pr.ConvertedAt, &pr.CompletedAt, &pr.CancelledAt, &pr.CreatedAt, &pr.UpdatedAt)
	if err != nil {
		return nil, err
	}
	pr.Lines = make([]PurchaseRequestLine, 0)
	return &pr, nil
}

func (r *Repository) Create(ctx context.Context, tenantID, requesterID string, input CreatePurchaseRequestInput) (*PurchaseRequest, error) {
	var pr *PurchaseRequest
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "PR")
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx, `
			INSERT INTO purchase_requests (tenant_id, number, requester_id, cost_center, reason)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING `+prColumns,
			tenantID, number, requesterID, input.CostCenter, input.Reason)
		created, err := scanPurchaseRequest(row)
		if err != nil {
			return fmt.Errorf("insert purchase request: %w", err)
		}
		if err := insertPRLines(ctx, tx, tenantID, created.ID, input.Lines); err != nil {
			return err
		}
		pr = created
		return nil
	})
	if err != nil {
		return nil, err
	}
	return pr, nil
}

// CreateWithCurrency creates PR with multi-currency support.
func (r *Repository) CreateWithCurrency(ctx context.Context, tenantID, requesterID string, input CreatePurchaseRequestInput, currency string, exchangeRate float64, baseAmountMinor int64) (*PurchaseRequest, error) {
	var pr *PurchaseRequest
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "PR")
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx, `
			INSERT INTO purchase_requests (tenant_id, number, requester_id, cost_center, reason,
			                               currency, exchange_rate, base_amount_minor)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING `+prColumns,
			tenantID, number, requesterID, input.CostCenter, input.Reason,
			currency, exchangeRate, baseAmountMinor)
		created, err := scanPurchaseRequest(row)
		if err != nil {
			return fmt.Errorf("insert purchase request: %w", err)
		}
		created.Currency = currency
		created.ExchangeRate = exchangeRate
		created.BaseAmountMinor = baseAmountMinor
		if err := insertPRLines(ctx, tx, tenantID, created.ID, input.Lines); err != nil {
			return err
		}
		pr = created
		return nil
	})
	if err != nil {
		return nil, err
	}
	return pr, nil
}

func insertPRLines(ctx context.Context, tx pgx.Tx, tenantID, prID string, lines []CreatePurchaseRequestLineInput) error {
	for _, line := range lines {
		_, err := tx.Exec(ctx, `
			INSERT INTO purchase_request_lines (
				tenant_id, purchase_request_id, product_id, quantity,
				estimated_price_minor, note
			) VALUES ($1, $2, $3, $4, $5, $6)`,
			tenantID, prID, line.ProductID, line.Quantity, line.EstimatedPriceMinor, line.Note)
		if err != nil {
			return fmt.Errorf("insert purchase request line: %w", err)
		}
	}
	return nil
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*PurchaseRequest, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+prColumns+`,
		       COALESCE(pr.currency, 'IDR'), COALESCE(pr.exchange_rate, 1.0), COALESCE(pr.base_amount_minor, 0),
		       (SELECT COALESCE(SUM(l.quantity * l.estimated_price_minor), 0)
		        FROM purchase_request_lines l WHERE l.tenant_id = pr.tenant_id AND l.purchase_request_id = pr.id)
		FROM purchase_requests pr
		WHERE pr.id = $1 AND pr.tenant_id = $2`, id, tenantID)
	var pr PurchaseRequest
	err := row.Scan(&pr.ID, &pr.TenantID, &pr.Number, &pr.RequesterID, &pr.CostCenter,
		&pr.Reason, &pr.Status, &pr.SubmittedAt, &pr.ApprovedAt, &pr.RejectedAt,
		&pr.ConvertedAt, &pr.CompletedAt, &pr.CancelledAt, &pr.CreatedAt, &pr.UpdatedAt,
		&pr.Currency, &pr.ExchangeRate, &pr.BaseAmountMinor, &pr.TotalMinor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query purchase request: %w", err)
	}
	pr.ApprovalStatus = "none"
	lines, err := r.prLinesFor(ctx, tenantID, []string{pr.ID})
	if err != nil {
		return nil, err
	}
	pr.Lines = lines[pr.ID]
	return &pr, nil
}

func (r *Repository) List(ctx context.Context, tenantID string) ([]PurchaseRequest, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+prColumns+`,
		       COALESCE(pr.currency, 'IDR'), COALESCE(pr.exchange_rate, 1.0), COALESCE(pr.base_amount_minor, 0),
		       (SELECT COALESCE(SUM(l.quantity * l.estimated_price_minor), 0)
		        FROM purchase_request_lines l WHERE l.tenant_id = pr.tenant_id AND l.purchase_request_id = pr.id)
		FROM purchase_requests pr
		WHERE pr.tenant_id = $1
		ORDER BY pr.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query purchase requests: %w", err)
	}
	defer rows.Close()
	list := make([]PurchaseRequest, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var pr PurchaseRequest
		err := rows.Scan(&pr.ID, &pr.TenantID, &pr.Number, &pr.RequesterID, &pr.CostCenter,
			&pr.Reason, &pr.Status, &pr.SubmittedAt, &pr.ApprovedAt, &pr.RejectedAt,
			&pr.ConvertedAt, &pr.CompletedAt, &pr.CancelledAt, &pr.CreatedAt, &pr.UpdatedAt,
			&pr.Currency, &pr.ExchangeRate, &pr.BaseAmountMinor, &pr.TotalMinor)
		if err != nil {
			return nil, fmt.Errorf("scan purchase request: %w", err)
		}
		pr.ApprovalStatus = "none"
		list = append(list, pr)
		ids = append(ids, pr.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate purchase requests: %w", err)
	}
	if len(ids) == 0 {
		return list, nil
	}
	linesByPR, err := r.prLinesFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		list[i].Lines = linesByPR[list[i].ID]
	}
	return list, nil
}

func (r *Repository) prLinesFor(ctx context.Context, tenantID string, prIDs []string) (map[string][]PurchaseRequestLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.purchase_request_id, l.id, l.product_id, p.name, p.sku,
		       l.quantity, l.estimated_price_minor, l.note, l.converted_qty
		FROM purchase_request_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.purchase_request_id = ANY($2)
		ORDER BY l.id`, tenantID, prIDs)
	if err != nil {
		return nil, fmt.Errorf("query purchase request lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]PurchaseRequestLine)
	for rows.Next() {
		var prID string
		var line PurchaseRequestLine
		if err := rows.Scan(&prID, &line.ID, &line.ProductID, &line.ProductName,
			&line.ProductSKU, &line.Quantity, &line.EstimatedPriceMinor,
			&line.Note, &line.ConvertedQty); err != nil {
			return nil, fmt.Errorf("scan purchase request line: %w", err)
		}
		line.PurchaseRequestID = prID
		out[prID] = append(out[prID], line)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate purchase request lines: %w", err)
	}
	return out, nil
}

func (r *Repository) Update(ctx context.Context, tenantID, id string, input CreatePurchaseRequestInput) (*PurchaseRequest, error) {
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `
			SELECT status FROM purchase_requests
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, id, tenantID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock purchase request: %w", err)
		}
		if status != "draft" {
			return ErrInvalidTransition
		}
		_, err = tx.Exec(ctx, `
			UPDATE purchase_requests SET reason = $3, cost_center = $4, updated_at = now()
			WHERE id = $1 AND tenant_id = $2`, id, tenantID, input.Reason, input.CostCenter)
		if err != nil {
			return fmt.Errorf("update purchase request header: %w", err)
		}
		_, err = tx.Exec(ctx, `
			DELETE FROM purchase_request_lines WHERE tenant_id = $1 AND purchase_request_id = $2`,
			tenantID, id)
		if err != nil {
			return fmt.Errorf("clear purchase request lines: %w", err)
		}
		return insertPRLines(ctx, tx, tenantID, id, input.Lines)
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, id)
}

func (r *Repository) SubmitWithStatus(ctx context.Context, tenantID, id, status string) (*PurchaseRequest, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE purchase_requests
		SET status = $3, submitted_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND status = 'draft'
		RETURNING `+prColumns, id, tenantID, status)
	pr, err := scanPurchaseRequest(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidTransition
		}
		return nil, fmt.Errorf("submit purchase request: %w", err)
	}
	return pr, nil
}

func (r *Repository) Cancel(ctx context.Context, tenantID, id string) (*PurchaseRequest, error) {
	row := r.pool.QueryRow(ctx, `
		UPDATE purchase_requests
		SET status = 'cancelled', cancelled_at = now(), updated_at = now()
		WHERE id = $1 AND tenant_id = $2 AND status IN ('draft', 'submitted')
		RETURNING `+prColumns, id, tenantID)
	pr, err := scanPurchaseRequest(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidTransition
		}
		return nil, fmt.Errorf("cancel purchase request: %w", err)
	}
	return pr, nil
}

func (r *Repository) ConvertPRToPO(ctx context.Context, tenantID, prID, actorID string, input ConvertPRInput) (*PurchaseOrder, error) {
	var po *PurchaseOrder
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `
			SELECT status FROM purchase_requests
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, prID, tenantID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock purchase request: %w", err)
		}
		if status != "approved" {
			return ErrInvalidTransition
		}
		number, err := r.codes.Next(ctx, tx, tenantID, "PO")
		if err != nil {
			return err
		}
		var poID string
		err = tx.QueryRow(ctx, `
			INSERT INTO purchase_orders (
				tenant_id, number, purchase_request_id, supplier_id, warehouse_id,
				expected_date, status, issued_at, created_by
			) VALUES ($1, $2, $3, $4, $5, $6, 'issued', now(), $7)
			RETURNING id`,
			tenantID, number, prID, input.SupplierID, input.WarehouseID,
			input.ExpectedDate, actorID).Scan(&poID)
		if err != nil {
			return fmt.Errorf("insert purchase order: %w", err)
		}
		for _, line := range input.Lines {
			var productID string
			var quantity, converted int64
			err := tx.QueryRow(ctx, `
				SELECT product_id, quantity, converted_qty
				FROM purchase_request_lines
				WHERE id = $1 AND purchase_request_id = $2 AND tenant_id = $3
				FOR UPDATE`, line.PurchaseRequestLineID, prID, tenantID).
				Scan(&productID, &quantity, &converted)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			if err != nil {
				return fmt.Errorf("lock purchase request line: %w", err)
			}
			if line.Quantity <= 0 || converted+line.Quantity > quantity {
				return ErrLineExhausted
			}
			tag, err := tx.Exec(ctx, `
				UPDATE purchase_request_lines
				SET converted_qty = converted_qty + $1
				WHERE id = $2 AND tenant_id = $3 AND converted_qty + $1 <= quantity
				RETURNING id`, line.Quantity, line.PurchaseRequestLineID, tenantID)
			if err != nil {
				return fmt.Errorf("update converted qty: %w", err)
			}
			if tag.RowsAffected() == 0 {
				return ErrLineExhausted
			}
			_, err = tx.Exec(ctx, `
				INSERT INTO purchase_order_lines (
					tenant_id, purchase_order_id, purchase_request_line_id, product_id,
					qty_ordered, allowed_qty, unit_price_minor
				) VALUES ($1, $2, $3, $4, $5, $5, $6)`,
				tenantID, poID, line.PurchaseRequestLineID, productID,
				line.Quantity, line.UnitPriceMinor)
			if err != nil {
				return fmt.Errorf("insert purchase order line: %w", err)
			}
		}
		var openLines int64
		err = tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM purchase_request_lines
			WHERE purchase_request_id = $1 AND tenant_id = $2 AND converted_qty < quantity`,
			prID, tenantID).Scan(&openLines)
		if err != nil {
			return fmt.Errorf("check pr coverage: %w", err)
		}
		if openLines == 0 {
			_, err = tx.Exec(ctx, `
				UPDATE purchase_requests
				SET status = 'converted', converted_at = now(), updated_at = now()
				WHERE id = $1 AND tenant_id = $2`, prID, tenantID)
			if err != nil {
				return fmt.Errorf("flip pr converted: %w", err)
			}
		}
		po = &PurchaseOrder{ID: poID, Number: number}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetPurchaseOrder(ctx, tenantID, po.ID)
}

func (r *Repository) GetPurchaseOrder(ctx context.Context, tenantID, id string) (*PurchaseOrder, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT po.id, po.tenant_id, po.number, po.purchase_request_id,
		       po.supplier_id, s.code, po.warehouse_id, w.code, po.terms, po.expected_date,
		       po.status, po.issued_at, po.closed_at, po.created_at, po.updated_at,
		       (SELECT COALESCE(SUM(l.qty_ordered * l.unit_price_minor), 0)
		        FROM purchase_order_lines l
		        WHERE l.tenant_id = po.tenant_id AND l.purchase_order_id = po.id)
		FROM purchase_orders po
		JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
		JOIN warehouses w ON w.tenant_id = po.tenant_id AND w.id = po.warehouse_id
		WHERE po.id = $1 AND po.tenant_id = $2`, id, tenantID)
	var po PurchaseOrder
	err := row.Scan(&po.ID, &po.TenantID, &po.Number, &po.PurchaseRequestID,
		&po.SupplierID, &po.SupplierCode, &po.WarehouseID, &po.WarehouseCode,
		&po.Terms, &po.ExpectedDate, &po.Status, &po.IssuedAt, &po.ClosedAt,
		&po.CreatedAt, &po.UpdatedAt, &po.TotalMinor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query purchase order: %w", err)
	}
	lines, err := r.poLinesFor(ctx, tenantID, []string{po.ID})
	if err != nil {
		return nil, err
	}
	po.Lines = lines[po.ID]
	return &po, nil
}

func (r *Repository) ListPurchaseOrders(ctx context.Context, tenantID string) ([]PurchaseOrder, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT po.id, po.tenant_id, po.number, po.purchase_request_id,
		       po.supplier_id, s.code, po.warehouse_id, w.code, po.terms, po.expected_date,
		       po.status, po.issued_at, po.closed_at, po.created_at, po.updated_at,
		       (SELECT COALESCE(SUM(l.qty_ordered * l.unit_price_minor), 0)
		        FROM purchase_order_lines l
		        WHERE l.tenant_id = po.tenant_id AND l.purchase_order_id = po.id)
		FROM purchase_orders po
		JOIN suppliers s ON s.tenant_id = po.tenant_id AND s.id = po.supplier_id
		JOIN warehouses w ON w.tenant_id = po.tenant_id AND w.id = po.warehouse_id
		WHERE po.tenant_id = $1
		ORDER BY po.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query purchase orders: %w", err)
	}
	defer rows.Close()
	list := make([]PurchaseOrder, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var po PurchaseOrder
		if err := rowScanPO(rows, &po); err != nil {
			return nil, err
		}
		list = append(list, po)
		ids = append(ids, po.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate purchase orders: %w", err)
	}
	if len(ids) == 0 {
		return list, nil
	}
	linesByPO, err := r.poLinesFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if lines, ok := linesByPO[list[i].ID]; ok {
			list[i].Lines = lines
		} else {
			list[i].Lines = make([]PurchaseOrderLine, 0)
		}
	}
	return list, nil
}

func (r *Repository) poLinesFor(ctx context.Context, tenantID string, poIDs []string) (map[string][]PurchaseOrderLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.purchase_order_id, l.id, l.purchase_request_line_id, l.product_id,
		       p.name, p.sku, l.qty_ordered, l.allowed_qty, l.received_qty, l.unit_price_minor
		FROM purchase_order_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.purchase_order_id = ANY($2)
		ORDER BY l.id`, tenantID, poIDs)
	if err != nil {
		return nil, fmt.Errorf("query purchase order lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]PurchaseOrderLine)
	for rows.Next() {
		var poID string
		var l PurchaseOrderLine
		if err := rows.Scan(&poID, &l.ID, &l.PurchaseRequestLine, &l.ProductID,
			&l.ProductName, &l.ProductSKU, &l.QtyOrdered, &l.AllowedQty,
			&l.ReceivedQty, &l.UnitPriceMinor); err != nil {
			return nil, fmt.Errorf("scan purchase order line: %w", err)
		}
		l.PurchaseOrderID = poID
		out[poID] = append(out[poID], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate purchase order lines: %w", err)
	}
	return out, nil
}

func rowScanPO(row interface{ Scan(...any) error }, po *PurchaseOrder) error {
	return row.Scan(&po.ID, &po.TenantID, &po.Number, &po.PurchaseRequestID,
		&po.SupplierID, &po.SupplierCode, &po.WarehouseID, &po.WarehouseCode,
		&po.Terms, &po.ExpectedDate, &po.Status, &po.IssuedAt, &po.ClosedAt,
		&po.CreatedAt, &po.UpdatedAt, &po.TotalMinor)
}

// RecordGoodsReceipt records a goods receipt in one transaction (W13).
func (r *Repository) RecordGoodsReceipt(ctx context.Context, tenantID, actorID string, input RecordGRInput) (*GoodsReceipt, error) {
	var gr *GoodsReceipt
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var poStatus string
		err := tx.QueryRow(ctx, `
			SELECT status FROM purchase_orders
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			input.PurchaseOrderID, tenantID).Scan(&poStatus)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock purchase order: %w", err)
		}
		if poStatus != "issued" && poStatus != "partially_received" {
			return ErrInvalidTransition
		}

		number, err := r.codes.Next(ctx, tx, tenantID, "GR")
		if err != nil {
			return err
		}

		var grID string
		err = tx.QueryRow(ctx, `
			INSERT INTO goods_receipts (
				tenant_id, number, purchase_order_id, warehouse_id, note, received_by
			) VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`,
			tenantID, number, input.PurchaseOrderID, input.WarehouseID,
			input.Note, actorID).Scan(&grID)
		if err != nil {
			return fmt.Errorf("insert goods receipt: %w", err)
		}

		for _, line := range input.Lines {
			var productID string
			var receivedQty, allowedQty int64
			var costMethod string
			err := tx.QueryRow(ctx, `
				SELECT pol.product_id, pol.received_qty, pol.allowed_qty, p.cost_method
				FROM purchase_order_lines pol
				JOIN products p ON p.tenant_id = pol.tenant_id AND p.id = pol.product_id
				WHERE pol.id = $1 AND pol.purchase_order_id = $2 AND pol.tenant_id = $3
				FOR UPDATE`,
				line.PurchaseOrderLineID, input.PurchaseOrderID, tenantID).
				Scan(&productID, &receivedQty, &allowedQty, &costMethod)
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrNotFound
			}
			if err != nil {
				return fmt.Errorf("lock purchase order line: %w", err)
			}
			if receivedQty+line.QtyReceived > allowedQty {
				return ErrLineExhausted
			}

			_, err = tx.Exec(ctx, `
				UPDATE purchase_order_lines
				SET received_qty = received_qty + $1
				WHERE id = $2 AND tenant_id = $3 AND received_qty + $1 <= allowed_qty`,
				line.QtyReceived, line.PurchaseOrderLineID, tenantID)
			if err != nil {
				return fmt.Errorf("update received qty: %w", err)
			}

			var oldOnHand, oldAvgCost int64
			err = tx.QueryRow(ctx, `
				SELECT on_hand, avg_cost_minor FROM stock_levels
				WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
				FOR UPDATE`,
				tenantID, productID, input.WarehouseID).Scan(&oldOnHand, &oldAvgCost)
			if errors.Is(err, pgx.ErrNoRows) {
				_, err = tx.Exec(ctx, `
					INSERT INTO stock_levels (tenant_id, product_id, warehouse_id, on_hand, avg_cost_minor)
					VALUES ($1, $2, $3, $4, $5)`,
					tenantID, productID, input.WarehouseID, line.QtyReceived, line.UnitCostMinor)
				if err != nil {
					return fmt.Errorf("insert stock level: %w", err)
				}
				oldOnHand = 0
			} else if err != nil {
				return fmt.Errorf("lock stock level: %w", err)
			} else {
				newAvgCost := oldAvgCost
				if costMethod == "average" && oldOnHand+line.QtyReceived > 0 {
					newAvgCost = (oldAvgCost*oldOnHand + line.UnitCostMinor*line.QtyReceived) / (oldOnHand + line.QtyReceived)
				}
				_, err = tx.Exec(ctx, `
					UPDATE stock_levels
					SET on_hand = on_hand + $1, avg_cost_minor = $2
					WHERE tenant_id = $3 AND product_id = $4 AND warehouse_id = $5`,
					line.QtyReceived, newAvgCost, tenantID, productID, input.WarehouseID)
				if err != nil {
					return fmt.Errorf("update stock level: %w", err)
				}
			}

			var movementSeq int64
			err = tx.QueryRow(ctx, `SELECT nextval('movement_seq')`).Scan(&movementSeq)
			if err != nil {
				return fmt.Errorf("next movement seq: %w", err)
			}
			balanceAfter := oldOnHand + line.QtyReceived

			_, err = tx.Exec(ctx, `
				INSERT INTO inventory_movements (
					tenant_id, movement_seq, document_type, document_id, movement_type,
					product_id, warehouse_id, qty, unit_cost_minor, balance_after, actor_user_id
				) VALUES ($1, $2, 'GR', $3, 'IN', $4, $5, $6, $7, $8, $9)`,
				tenantID, movementSeq, grID, productID, input.WarehouseID,
				line.QtyReceived, line.UnitCostMinor, balanceAfter, actorID)
			if err != nil {
				return fmt.Errorf("insert inventory movement: %w", err)
			}

			if costMethod == "fifo" {
				_, err = tx.Exec(ctx, `
					INSERT INTO inventory_cost_layers (
						tenant_id, product_id, warehouse_id, qty_in, qty_remaining,
						unit_cost_minor, source_movement_seq
					) VALUES ($1, $2, $3, $4, $4, $5, $6)`,
					tenantID, productID, input.WarehouseID, line.QtyReceived,
					line.UnitCostMinor, movementSeq)
				if err != nil {
					return fmt.Errorf("insert fifo layer: %w", err)
				}
			}

			_, err = tx.Exec(ctx, `
				INSERT INTO goods_receipt_lines (
					tenant_id, goods_receipt_id, purchase_order_line_id, product_id,
					qty_received, unit_cost_minor, discrepancy_note
				) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				tenantID, grID, line.PurchaseOrderLineID, productID,
				line.QtyReceived, line.UnitCostMinor, line.DiscrepancyNote)
			if err != nil {
				return fmt.Errorf("insert goods receipt line: %w", err)
			}
		}

		var openLines int64
		err = tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM purchase_order_lines
			WHERE purchase_order_id = $1 AND tenant_id = $2 AND received_qty < qty_ordered`,
			input.PurchaseOrderID, tenantID).Scan(&openLines)
		if err != nil {
			return fmt.Errorf("check po coverage: %w", err)
		}
		newStatus := "partially_received"
		if openLines == 0 {
			newStatus = "received"
		}
		_, err = tx.Exec(ctx, `
			UPDATE purchase_orders SET status = $1 WHERE id = $2 AND tenant_id = $3`,
			newStatus, input.PurchaseOrderID, tenantID)
		if err != nil {
			return fmt.Errorf("update po status: %w", err)
		}

		gr = &GoodsReceipt{ID: grID, Number: number}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetGoodsReceipt(ctx, tenantID, gr.ID)
}

func (r *Repository) GetGoodsReceipt(ctx context.Context, tenantID, id string) (*GoodsReceipt, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT gr.id, gr.tenant_id, gr.number, gr.purchase_order_id, po.number,
		       gr.warehouse_id, w.code, gr.note, gr.received_by, gr.received_at, gr.created_at,
		       (SELECT COALESCE(SUM(l.qty_received * l.unit_cost_minor), 0)
		        FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)
		FROM goods_receipts gr
		JOIN purchase_orders po ON po.tenant_id = gr.tenant_id AND po.id = gr.purchase_order_id
		JOIN warehouses w ON w.tenant_id = gr.tenant_id AND w.id = gr.warehouse_id
		WHERE gr.id = $1 AND gr.tenant_id = $2`, id, tenantID)
	var gr GoodsReceipt
	err := row.Scan(&gr.ID, &gr.TenantID, &gr.Number, &gr.PurchaseOrderID, &gr.PurchaseOrderNum,
		&gr.WarehouseID, &gr.WarehouseCode, &gr.Note, &gr.ReceivedBy, &gr.ReceivedAt,
		&gr.CreatedAt, &gr.TotalValueMinor)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query goods receipt: %w", err)
	}
	lines, err := r.grLinesFor(ctx, tenantID, []string{gr.ID})
	if err != nil {
		return nil, err
	}
	gr.Lines = lines[gr.ID]
	return &gr, nil
}

// ListGoodsReceipts returns goods receipts with lines (single extra query).
func (r *Repository) ListGoodsReceipts(ctx context.Context, tenantID string) ([]GoodsReceipt, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT gr.id, gr.tenant_id, gr.number, gr.purchase_order_id, po.number,
		       gr.warehouse_id, w.code, gr.note, gr.received_by, gr.received_at, gr.created_at,
		       (SELECT COALESCE(SUM(l.qty_received * l.unit_cost_minor), 0)
		        FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id)
		FROM goods_receipts gr
		JOIN purchase_orders po ON po.tenant_id = gr.tenant_id AND po.id = gr.purchase_order_id
		JOIN warehouses w ON w.tenant_id = gr.tenant_id AND w.id = gr.warehouse_id
		WHERE gr.tenant_id = $1
		ORDER BY gr.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query goods receipts: %w", err)
	}
	defer rows.Close()
	list := make([]GoodsReceipt, 0)
	ids := make([]string, 0)
	for rows.Next() {
		var gr GoodsReceipt
		if err := rows.Scan(&gr.ID, &gr.TenantID, &gr.Number, &gr.PurchaseOrderID, &gr.PurchaseOrderNum,
			&gr.WarehouseID, &gr.WarehouseCode, &gr.Note, &gr.ReceivedBy, &gr.ReceivedAt,
			&gr.CreatedAt, &gr.TotalValueMinor); err != nil {
			return nil, fmt.Errorf("scan goods receipt: %w", err)
		}
		list = append(list, gr)
		ids = append(ids, gr.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate goods receipts: %w", err)
	}
	if len(ids) == 0 {
		return list, nil
	}
	linesByGR, err := r.grLinesFor(ctx, tenantID, ids)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if lines, ok := linesByGR[list[i].ID]; ok {
			list[i].Lines = lines
		} else {
			list[i].Lines = make([]GoodsReceiptLine, 0)
		}
	}
	return list, nil
}

func (r *Repository) grLinesFor(ctx context.Context, tenantID string, grIDs []string) (map[string][]GoodsReceiptLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.goods_receipt_id, l.id, l.purchase_order_line_id, l.product_id,
		       p.name, p.sku, l.qty_received, l.unit_cost_minor, l.discrepancy_note
		FROM goods_receipt_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.goods_receipt_id = ANY($2)
		ORDER BY l.id`, tenantID, grIDs)
	if err != nil {
		return nil, fmt.Errorf("query goods receipt lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]GoodsReceiptLine)
	for rows.Next() {
		var grID string
		var l GoodsReceiptLine
		if err := rows.Scan(&grID, &l.ID, &l.PurchaseOrderLineID, &l.ProductID,
			&l.ProductName, &l.ProductSKU, &l.QtyReceived, &l.UnitCostMinor,
			&l.DiscrepancyNote); err != nil {
			return nil, fmt.Errorf("scan goods receipt line: %w", err)
		}
		l.GoodsReceiptID = grID
		out[grID] = append(out[grID], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate goods receipt lines: %w", err)
	}
	return out, nil
}

// FinalizeByApproval flips PR status when the linked approval settles.
// Only acts on PR with status "submitted".
func (r *Repository) FinalizeByApproval(ctx context.Context, tenantID, id, status, actorID string) error {
	var newStatus string
	switch status {
	case "approved":
		newStatus = "approved"
	case "rejected":
		newStatus = "rejected"
	default:
		return nil
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE purchase_requests
		SET status = $1, updated_at = now()
		WHERE id = $2 AND tenant_id = $3 AND status = 'submitted'`,
		newStatus, id, tenantID)
	return err
}

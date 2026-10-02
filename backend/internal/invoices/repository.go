package invoices

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
	ErrNotFound         = errors.New("supplier invoice not found")
	ErrProductRequired  = errors.New("each line must reference a catalog product")
	ErrInvoiceClosed    = errors.New("invoice is closed or paid")
	ErrOverpayment      = errors.New("payment amount exceeds invoice remaining")
	ErrInsufficientCash = errors.New("cash account balance insufficient")
)

type SupplierInvoice struct {
	ID              string                `json:"id"`
	TenantID        string                `json:"tenant_id"`
	Number          string                `json:"number"`
	SupplierID      string                `json:"supplier_id"`
	SupplierCode    string                `json:"supplier_code"`
	PurchaseOrderID *string               `json:"purchase_order_id"`
	GoodsReceiptID  *string               `json:"goods_receipt_id"`
	InvoiceDate     time.Time             `json:"invoice_date"`
	DueDate         *time.Time            `json:"due_date"`
	Status          string                `json:"status"`
	TotalMinor      int64                 `json:"total_minor"`
	PaidMinor       int64                 `json:"paid_minor"`
	Note            string                `json:"note"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
	Lines           []SupplierInvoiceLine `json:"lines"`
}

type SupplierInvoiceLine struct {
	ID                  string  `json:"id"`
	InvoiceID           string  `json:"invoice_id"`
	PurchaseOrderLineID *string `json:"purchase_order_line_id"`
	ProductID           string  `json:"product_id"`
	ProductName         string  `json:"product_name"`
	ProductSKU          string  `json:"product_sku"`
	QtyInvoiced         int64   `json:"qty_invoiced"`
	UnitPriceMinor      int64   `json:"unit_price_minor"`
	MatchStatus         string  `json:"match_status"`
	MatchNote           *string `json:"match_note"`
}

type Payment struct {
	ID                 string    `json:"id"`
	TenantID           string    `json:"tenant_id"`
	Number             string    `json:"number"`
	SupplierInvoiceID  string    `json:"supplier_invoice_id"`
	SupplierInvoiceNum string    `json:"supplier_invoice_number"`
	CashAccountID      string    `json:"cash_account_id"`
	CashAccountName    string    `json:"cash_account_name"`
	AmountMinor        int64     `json:"amount_minor"`
	PaymentDate        time.Time `json:"payment_date"`
	PaymentMethod      string    `json:"payment_method"`
	Reference          string    `json:"reference"`
	Note               string    `json:"note"`
	Status             string    `json:"status"`
	RecordedBy         string    `json:"recorded_by"`
	CreatedAt          time.Time `json:"created_at"`
}

type CreateInvoiceLineInput struct {
	PurchaseOrderLineID *string
	ProductID           string
	QtyInvoiced         int64
	UnitPriceMinor      int64
}

type CreateInvoiceInput struct {
	SupplierID      string
	PurchaseOrderID *string
	GoodsReceiptID  *string
	DueDate         *string
	Note            string
	Lines           []CreateInvoiceLineInput
}

type RecordPaymentInput struct {
	SupplierInvoiceID string
	CashAccountID     string
	AmountMinor       int64
	PaymentDate       *string
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

const invoiceColumns = `si.id, si.tenant_id, si.number, si.supplier_id, s.code,
	si.purchase_order_id, si.goods_receipt_id, si.invoice_date, si.due_date,
	si.status, si.total_minor, si.paid_minor, si.note, si.created_at, si.updated_at`

func scanInvoice(row interface{ Scan(...any) error }) (*SupplierInvoice, error) {
	var inv SupplierInvoice
	err := row.Scan(&inv.ID, &inv.TenantID, &inv.Number, &inv.SupplierID, &inv.SupplierCode,
		&inv.PurchaseOrderID, &inv.GoodsReceiptID, &inv.InvoiceDate, &inv.DueDate,
		&inv.Status, &inv.TotalMinor, &inv.PaidMinor, &inv.Note,
		&inv.CreatedAt, &inv.UpdatedAt)
	if err != nil {
		return nil, err
	}
	inv.Lines = make([]SupplierInvoiceLine, 0)
	return &inv, nil
}

// NextNumber peeks the next system invoice number without reserving it.
func (r *Repository) NextNumber(ctx context.Context, tenantID string) (string, error) {
	var next int64
	err := r.pool.QueryRow(ctx, `
		SELECT GREATEST(
			COALESCE((SELECT last_value FROM code_sequences WHERE tenant_id = $1 AND prefix = 'SINV'), 0),
			COALESCE((SELECT MAX((regexp_match(number, '^SINV-([0-9]+)$'))[1]::bigint) FROM supplier_invoices WHERE tenant_id = $1), 0)
		) + 1`, tenantID).Scan(&next)
	if err != nil {
		return "", fmt.Errorf("peek next invoice number: %w", err)
	}
	return fmt.Sprintf("SINV-%04d", next), nil
}

// Create records a supplier invoice with a system-allocated number and
// evaluates three-way match per line (qty vs received, price vs PO price).
func (r *Repository) Create(ctx context.Context, tenantID, actorID string, input CreateInvoiceInput) (*SupplierInvoice, error) {
	var invID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		number, err := r.codes.Next(ctx, tx, tenantID, "SINV")
		if err != nil {
			return err
		}

		total := int64(0)
		anyDisputed := false
		anyPORef := false

		type preparedLine struct {
			line        CreateInvoiceLineInput
			matchStatus string
			matchNote   *string
		}
		prepared := make([]preparedLine, 0, len(input.Lines))

		for _, line := range input.Lines {
			total += line.QtyInvoiced * line.UnitPriceMinor
			status := "matched"
			var note *string

			if line.PurchaseOrderLineID != nil {
				anyPORef = true
				var poProductID string
				var receivedQty, poPrice int64
				err := tx.QueryRow(ctx, `
					SELECT product_id, received_qty, unit_price_minor
					FROM purchase_order_lines
					WHERE id = $1 AND tenant_id = $2`,
					*line.PurchaseOrderLineID, tenantID).Scan(&poProductID, &receivedQty, &poPrice)
				if errors.Is(err, pgx.ErrNoRows) {
					return ErrNotFound
				}
				if err != nil {
					return fmt.Errorf("load po line for match: %w", err)
				}
				reasons := make([]string, 0)
				if poProductID != line.ProductID {
					reasons = append(reasons, "product differs from PO line")
				}
				if line.QtyInvoiced > receivedQty {
					reasons = append(reasons, fmt.Sprintf("qty invoiced exceeds received (%d)", receivedQty))
				}
				if line.UnitPriceMinor != poPrice {
					reasons = append(reasons, fmt.Sprintf("price differs from PO (%d)", poPrice))
				}
				if len(reasons) > 0 {
					status = "disputed"
					joined := reasons[0]
					for _, extra := range reasons[1:] {
						joined += "; " + extra
					}
					note = &joined
					anyDisputed = true
				}
			}

			prepared = append(prepared, preparedLine{line: line, matchStatus: status, matchNote: note})
		}

		status := "open"
		if anyPORef {
			status = "matched"
			if anyDisputed {
				status = "disputed"
			}
		}

		err = tx.QueryRow(ctx, `
			INSERT INTO supplier_invoices (
				tenant_id, number, supplier_id, purchase_order_id, goods_receipt_id,
				due_date, status, total_minor, paid_minor, note, created_by
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
			RETURNING id`,
			tenantID, number, input.SupplierID, input.PurchaseOrderID,
			input.GoodsReceiptID, input.DueDate, status, total, input.Note, actorID).Scan(&invID)
		if err != nil {
			return fmt.Errorf("insert supplier invoice: %w", err)
		}

		for _, p := range prepared {
			_, err := tx.Exec(ctx, `
				INSERT INTO supplier_invoice_lines (
					tenant_id, invoice_id, purchase_order_line_id, product_id,
					qty_invoiced, unit_price_minor, match_status, match_note
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				tenantID, invID, p.line.PurchaseOrderLineID, p.line.ProductID,
				p.line.QtyInvoiced, p.line.UnitPriceMinor, p.matchStatus, p.matchNote)
			if err != nil {
				return fmt.Errorf("insert supplier invoice line: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, invID)
}

func (r *Repository) GetByID(ctx context.Context, tenantID, id string) (*SupplierInvoice, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT `+invoiceColumns+`
		FROM supplier_invoices si
		JOIN suppliers s ON s.tenant_id = si.tenant_id AND s.id = si.supplier_id
		WHERE si.id = $1 AND si.tenant_id = $2`, id, tenantID)
	inv, err := scanInvoice(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query supplier invoice: %w", err)
	}
	lines, err := r.linesFor(ctx, tenantID, []string{inv.ID})
	if err != nil {
		return nil, err
	}
	inv.Lines = lines[inv.ID]
	return inv, nil
}

func (r *Repository) List(ctx context.Context, tenantID string) ([]SupplierInvoice, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT `+invoiceColumns+`
		FROM supplier_invoices si
		JOIN suppliers s ON s.tenant_id = si.tenant_id AND s.id = si.supplier_id
		WHERE si.tenant_id = $1
		ORDER BY si.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query supplier invoices: %w", err)
	}
	defer rows.Close()
	list := make([]SupplierInvoice, 0)
	for rows.Next() {
		inv, err := scanInvoice(rows)
		if err != nil {
			return nil, fmt.Errorf("scan supplier invoice: %w", err)
		}
		list = append(list, *inv)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate supplier invoices: %w", err)
	}
	return list, nil
}

func (r *Repository) linesFor(ctx context.Context, tenantID string, invoiceIDs []string) (map[string][]SupplierInvoiceLine, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT l.invoice_id, l.id, l.purchase_order_line_id, l.product_id,
		       p.name, p.sku, l.qty_invoiced, l.unit_price_minor, l.match_status, l.match_note
		FROM supplier_invoice_lines l
		JOIN products p ON p.tenant_id = l.tenant_id AND p.id = l.product_id
		WHERE l.tenant_id = $1 AND l.invoice_id = ANY($2)
		ORDER BY l.id`, tenantID, invoiceIDs)
	if err != nil {
		return nil, fmt.Errorf("query supplier invoice lines: %w", err)
	}
	defer rows.Close()
	out := make(map[string][]SupplierInvoiceLine)
	for rows.Next() {
		var invoiceID string
		var l SupplierInvoiceLine
		if err := rows.Scan(&invoiceID, &l.ID, &l.PurchaseOrderLineID, &l.ProductID,
			&l.ProductName, &l.ProductSKU, &l.QtyInvoiced, &l.UnitPriceMinor,
			&l.MatchStatus, &l.MatchNote); err != nil {
			return nil, fmt.Errorf("scan supplier invoice line: %w", err)
		}
		l.InvoiceID = invoiceID
		out[invoiceID] = append(out[invoiceID], l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate supplier invoice lines: %w", err)
	}
	return out, nil
}

// RecordPayment records a payment in one transaction with row locks on the
// invoice and the cash account; flips invoice to partial/paid.
func (r *Repository) RecordPayment(ctx context.Context, tenantID, actorID string, input RecordPaymentInput) (*Payment, error) {
	var payment *Payment
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, invNumber string
		var totalMinor, paidMinor int64
		err := tx.QueryRow(ctx, `
			SELECT status, total_minor, paid_minor, number
			FROM supplier_invoices
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			input.SupplierInvoiceID, tenantID).Scan(&status, &totalMinor, &paidMinor, &invNumber)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock supplier invoice: %w", err)
		}
		if status == "paid" || status == "cancelled" {
			return ErrInvoiceClosed
		}

		remaining := totalMinor - paidMinor
		if input.AmountMinor > remaining {
			return ErrOverpayment
		}

		var balance int64
		var accActive bool
		var accName string
		err = tx.QueryRow(ctx, `
			SELECT balance_minor, is_active, name
			FROM cash_accounts
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			input.CashAccountID, tenantID).Scan(&balance, &accActive, &accName)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock cash account: %w", err)
		}
		if !accActive {
			return ErrInvoiceClosed
		}
		if balance < input.AmountMinor {
			return ErrInsufficientCash
		}

		payNumber, err := r.codes.Next(ctx, tx, tenantID, "PAY")
		if err != nil {
			return err
		}

		var payID string
		err = tx.QueryRow(ctx, `
			INSERT INTO payments (
				tenant_id, number, supplier_invoice_id, cash_account_id, amount_minor,
				payment_date, payment_method, reference, note, recorded_by
			) VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()), $7, $8, $9, $10)
			RETURNING id`,
			tenantID, payNumber, input.SupplierInvoiceID, input.CashAccountID,
			input.AmountMinor, input.PaymentDate, input.PaymentMethod,
			input.Reference, input.Note, actorID).Scan(&payID)
		if err != nil {
			return fmt.Errorf("insert payment: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE cash_accounts SET balance_minor = balance_minor - $1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`,
			input.AmountMinor, input.CashAccountID, tenantID)
		if err != nil {
			return fmt.Errorf("reduce cash balance: %w", err)
		}

		newPaid := paidMinor + input.AmountMinor
		newStatus := "partial"
		if newPaid == totalMinor {
			newStatus = "paid"
		}
		_, err = tx.Exec(ctx, `
			UPDATE supplier_invoices SET paid_minor = $1, status = $2, updated_at = now()
			WHERE id = $3 AND tenant_id = $4`,
			newPaid, newStatus, input.SupplierInvoiceID, tenantID)
		if err != nil {
			return fmt.Errorf("update invoice payment: %w", err)
		}

		payment = &Payment{ID: payID, Number: payNumber, SupplierInvoiceNum: invNumber, CashAccountName: accName}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetPayment(ctx, tenantID, payment.ID)
}

func (r *Repository) GetPayment(ctx context.Context, tenantID, id string) (*Payment, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT p.id, p.tenant_id, p.number, p.supplier_invoice_id, si.number,
		       p.cash_account_id, ca.name, p.amount_minor, p.payment_date,
		       p.payment_method, p.reference, p.note, p.status, p.recorded_by, p.created_at
		FROM payments p
		JOIN supplier_invoices si ON si.tenant_id = p.tenant_id AND si.id = p.supplier_invoice_id
		JOIN cash_accounts ca ON ca.tenant_id = p.tenant_id AND ca.id = p.cash_account_id
		WHERE p.id = $1 AND p.tenant_id = $2`, id, tenantID)
	var pay Payment
	err := row.Scan(&pay.ID, &pay.TenantID, &pay.Number, &pay.SupplierInvoiceID, &pay.SupplierInvoiceNum,
		&pay.CashAccountID, &pay.CashAccountName, &pay.AmountMinor, &pay.PaymentDate,
		&pay.PaymentMethod, &pay.Reference, &pay.Note, &pay.Status, &pay.RecordedBy, &pay.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query payment: %w", err)
	}
	return &pay, nil
}

func (r *Repository) ListPayments(ctx context.Context, tenantID string) ([]Payment, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT p.id, p.tenant_id, p.number, p.supplier_invoice_id, si.number,
		       p.cash_account_id, ca.name, p.amount_minor, p.payment_date,
		       p.payment_method, p.reference, p.note, p.status, p.recorded_by, p.created_at
		FROM payments p
		JOIN supplier_invoices si ON si.tenant_id = p.tenant_id AND si.id = p.supplier_invoice_id
		JOIN cash_accounts ca ON ca.tenant_id = p.tenant_id AND ca.id = p.cash_account_id
		WHERE p.tenant_id = $1
		ORDER BY p.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("query payments: %w", err)
	}
	defer rows.Close()
	list := make([]Payment, 0)
	for rows.Next() {
		var pay Payment
		if err := rows.Scan(&pay.ID, &pay.TenantID, &pay.Number, &pay.SupplierInvoiceID, &pay.SupplierInvoiceNum,
			&pay.CashAccountID, &pay.CashAccountName, &pay.AmountMinor, &pay.PaymentDate,
			&pay.PaymentMethod, &pay.Reference, &pay.Note, &pay.Status,
			&pay.RecordedBy, &pay.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan payment: %w", err)
		}
		list = append(list, pay)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate payments: %w", err)
	}
	return list, nil
}

// CancelPayment reverses a completed payment atomically.
func (r *Repository) CancelPayment(ctx context.Context, tenantID, paymentID string) (*Payment, error) {
	var payment *Payment
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var status, supplierInvoiceID, cashAccountID string
		var amount int64
		err := tx.QueryRow(ctx, `
			SELECT status, supplier_invoice_id, cash_account_id, amount_minor
			FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			paymentID, tenantID).Scan(&status, &supplierInvoiceID, &cashAccountID, &amount)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("lock payment: %w", err)
		}
		if status != "completed" {
			return ErrInvoiceClosed
		}

		_, err = tx.Exec(ctx, `
			UPDATE payments SET status = 'cancelled', updated_at = now()
			WHERE id = $1 AND tenant_id = $2`, paymentID, tenantID)
		if err != nil {
			return fmt.Errorf("cancel payment: %w", err)
		}

		_, err = tx.Exec(ctx, `
			UPDATE cash_accounts SET balance_minor = balance_minor + $1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, amount, cashAccountID, tenantID)
		if err != nil {
			return fmt.Errorf("restore cash balance: %w", err)
		}

		var totalMinor, currentPaid int64
		err = tx.QueryRow(ctx, `
			SELECT total_minor, paid_minor FROM supplier_invoices
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			supplierInvoiceID, tenantID).Scan(&totalMinor, &currentPaid)
		if err != nil {
			return fmt.Errorf("lock invoice: %w", err)
		}
		newPaid := currentPaid - amount
		if newPaid < 0 {
			newPaid = 0
		}
		newStatus := "matched"
		if newPaid == 0 {
			newStatus = "open"
		} else if newPaid == totalMinor {
			newStatus = "paid"
		} else {
			newStatus = "partial"
		}
		_, err = tx.Exec(ctx, `
			UPDATE supplier_invoices SET paid_minor = $1, status = $2, updated_at = now()
			WHERE id = $3 AND tenant_id = $4`,
			newPaid, newStatus, supplierInvoiceID, tenantID)
		if err != nil {
			return fmt.Errorf("restore invoice paid: %w", err)
		}

		payment = &Payment{ID: paymentID}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return r.GetPayment(ctx, tenantID, payment.ID)
}

package httpapi

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/neuralforgeio/StockKit/internal/approval"
	"github.com/neuralforgeio/StockKit/internal/audit"
	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/categories"
	fieldcipher "github.com/neuralforgeio/StockKit/internal/crypto"
	"github.com/neuralforgeio/StockKit/internal/customers"
	"github.com/neuralforgeio/StockKit/internal/dashboard"
	"github.com/neuralforgeio/StockKit/internal/finance"
	"github.com/neuralforgeio/StockKit/internal/fx"
	"github.com/neuralforgeio/StockKit/internal/httpapi/handlers"
	"github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
	"github.com/neuralforgeio/StockKit/internal/inventory"
	"github.com/neuralforgeio/StockKit/internal/invoices"
	"github.com/neuralforgeio/StockKit/internal/notify"
	"github.com/neuralforgeio/StockKit/internal/products"
	"github.com/neuralforgeio/StockKit/internal/purchasing"
	"github.com/neuralforgeio/StockKit/internal/realtime"
	"github.com/neuralforgeio/StockKit/internal/sales"
	"github.com/neuralforgeio/StockKit/internal/suppliers"
	"github.com/neuralforgeio/StockKit/internal/units"
	"github.com/neuralforgeio/StockKit/internal/warehouses"
)

func New(logger *slog.Logger, pool *pgxpool.Pool, rdb *redis.Client, kp *auth.KeyPair, cipher *fieldcipher.Cipher) http.Handler {
	sys := handlers.NewSystem(pool, rdb)
	authH := handlers.NewAuth(pool, kp, logger)

	productRepo := products.NewRepository(pool)
	productSvc := products.NewService(productRepo)
	productsH := handlers.NewProducts(productSvc)

	unitsRepo := units.NewRepository(pool)
	unitsH := handlers.NewUnits(unitsRepo)

	categoriesRepo := categories.NewRepository(pool)
	categoriesSvc := categories.NewService(categoriesRepo)
	categoriesH := handlers.NewCategories(categoriesSvc)

	warehousesRepo := warehouses.NewRepository(pool)
	warehousesSvc := warehouses.NewService(warehousesRepo)
	warehousesH := handlers.NewWarehouses(warehousesSvc)

	customersRepo := customers.NewRepository(pool)
	customersSvc := customers.NewService(customersRepo)
	customersH := handlers.NewCustomers(customersSvc)

	suppliersRepo := suppliers.NewRepository(pool)
	suppliersSvc := suppliers.NewService(suppliersRepo, cipher)
	suppliersH := handlers.NewSuppliers(suppliersSvc)

	inventoryRepo := inventory.NewRepository(pool)
	inventorySvc := inventory.NewService(inventoryRepo)
	inventoryH := handlers.NewInventory(inventorySvc)

	notifySvc := notify.New(pool)

	// Realtime hub: server-side 2s poll, client push via WebSocket.
	rtHub := realtime.NewHub(pool)
	go rtHub.Run(context.Background())
	wsH := handlers.NewNotificationsWS(rtHub)

	approvalRepo := approval.NewRepository(pool)

	// Repositories needed by approval finalizers MUST be declared before approvalSvc.
	purchasingRepo := purchasing.NewRepository(pool)
	salesRepo := sales.NewRepository(pool)

	// Approval service with a dispatcher finalizer that routes by document_type.
	approvalSvc := approval.NewService(approvalRepo, notifySvc,
		func(ctx context.Context, tenantID, docType, docID, docStatus, actorID string) error {
			switch docType {
			case "SO":
				return salesRepo.FinalizeByApproval(ctx, tenantID, docID, docStatus, actorID)
			case "PR":
				return purchasingRepo.FinalizeByApproval(ctx, tenantID, docID, docStatus, actorID)
			}
			return nil
		},
	)

	approvalsH := handlers.NewApprovals(approvalSvc)
	rulesH := handlers.NewApprovalRules(approvalSvc)

	notificationsH := handlers.NewNotifications(notifySvc)

	// FX service for multi-currency
	fxRepo := fx.NewRepository(pool)
	fxSvc := fx.NewService(fxRepo)
	fxH := handlers.NewFX(fxSvc)

	// Purchasing with FX support (variadic fxSvc for backward compatibility)
	purchasingSvc := purchasing.NewService(purchasingRepo, approvalSvc, fxSvc)
	purchasingH := handlers.NewPurchasing(purchasingSvc)

	invoicesRepo := invoices.NewRepository(pool)
	invoicesSvc := invoices.NewService(invoicesRepo)
	invoicesH := handlers.NewInvoices(invoicesSvc)

	financeRepo := finance.NewRepository(pool)
	financeSvc := finance.NewService(financeRepo)
	financeH := handlers.NewFinance(financeSvc)

	// Sales with FX support
	salesSvc := sales.NewService(salesRepo, approvalSvc, fxSvc)
	salesH := handlers.NewSales(salesSvc)

	dashboardSvc := dashboard.NewService(dashboard.NewRepository(pool))
	dashboardH := handlers.NewDashboard(dashboardSvc)

	usersH := handlers.NewUsers(pool)
	devH := handlers.NewDev(pool, "./logs")

	auditRepo := audit.NewRepository(pool)
	auditH := handlers.NewAudit(auditRepo)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.ColoredLogger(logger))
	r.Use(middleware.Recoverer(logger))
	r.Use(middleware.VersionHeader)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.CSRF)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/healthz", sys.Healthz)
		r.Get("/readyz", sys.Readyz)
		r.Get("/version", sys.Version)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/login", authH.Login)
			r.Post("/refresh", authH.Refresh)
			r.Post("/logout", authH.Logout)
			r.Group(func(r chi.Router) {
				r.Use(middleware.AuthN(kp))
				r.Get("/me", authH.Me)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.AuthN(kp))

			r.Route("/notifications", func(r chi.Router) {
				r.Get("/", notificationsH.List)
				r.Get("/unread-count", notificationsH.UnreadCount)
				r.Post("/read-all", notificationsH.MarkAll)
				r.Post("/{id}/read", notificationsH.MarkRead)
				r.Get("/ws", wsH.ServeWS)
			})

			r.Route("/approval-rules", func(r chi.Router) {
				r.Get("/", rulesH.List)
				r.Post("/", rulesH.Create)
				r.Patch("/{id}", rulesH.Update)
				r.Delete("/{id}", rulesH.Delete)
			})

			r.Route("/products", func(r chi.Router) {
				r.Get("/", productsH.List)
				r.Post("/", productsH.Create)
				r.Get("/next-sku", productsH.NextSKU)
				r.Get("/{id}", productsH.GetByID)
				r.Patch("/{id}", productsH.Update)
				r.Delete("/{id}", productsH.Delete)
				r.Post("/{id}/images", productsH.UploadImage)
				r.Get("/{id}/images", productsH.ListImages)
			})
			r.Get("/product-images/{id}/content", productsH.GetImageContent)
			r.Delete("/product-images/{id}", productsH.DeleteImage)
			r.Post("/product-images/{id}/set-primary", productsH.SetPrimaryImage)

			r.Route("/units", func(r chi.Router) {
				r.Get("/", unitsH.List)
				r.Post("/", unitsH.Create)
				r.Patch("/{id}", unitsH.Update)
				r.Delete("/{id}", unitsH.Delete)
			})

			r.Route("/categories", func(r chi.Router) {
				r.Get("/", categoriesH.List)
				r.Post("/", categoriesH.Create)
				r.Get("/{id}", categoriesH.GetByID)
				r.Patch("/{id}", categoriesH.Update)
				r.Patch("/{id}/status", categoriesH.SetActive)
				r.Delete("/{id}", categoriesH.Delete)
			})

			r.Route("/warehouses", func(r chi.Router) {
				r.Get("/", warehousesH.List)
				r.Post("/", warehousesH.Create)
				r.Get("/{id}", warehousesH.GetByID)
				r.Patch("/{id}", warehousesH.Update)
				r.Patch("/{id}/status", warehousesH.SetActive)
				r.Delete("/{id}", warehousesH.Delete)
			})

			r.Route("/customers", func(r chi.Router) {
				r.Get("/", customersH.List)
				r.Post("/", customersH.Create)
				r.Get("/{id}", customersH.GetByID)
				r.Patch("/{id}", customersH.Update)
				r.Patch("/{id}/status", customersH.SetActive)
				r.Delete("/{id}", customersH.Delete)
			})

			r.Route("/suppliers", func(r chi.Router) {
				r.Get("/", suppliersH.List)
				r.Post("/", suppliersH.Create)
				r.Get("/{id}", suppliersH.GetByID)
				r.Patch("/{id}", suppliersH.Update)
				r.Patch("/{id}/status", suppliersH.SetActive)
				r.Delete("/{id}", suppliersH.Delete)
			})

			r.Route("/inventory", func(r chi.Router) {
				r.Get("/stock-levels", inventoryH.ListStockLevels)
				r.Get("/movements", inventoryH.ListMovements)
				r.Post("/adjustments", inventoryH.RecordAdjustment)
			})

			r.Route("/purchase-requests", func(r chi.Router) {
				r.Get("/", purchasingH.List)
				r.Post("/", purchasingH.Create)
				r.Get("/{id}", purchasingH.GetByID)
				r.Patch("/{id}", purchasingH.Update)
				r.Post("/{id}/submit", purchasingH.Submit)
				r.Post("/{id}/cancel", purchasingH.Cancel)
				r.Post("/{id}/convert", purchasingH.Convert)
			})

			r.Route("/purchase-orders", func(r chi.Router) {
				r.Get("/", purchasingH.ListPurchaseOrders)
				r.Get("/{id}", purchasingH.GetPurchaseOrder)
			})

			r.Route("/goods-receipts", func(r chi.Router) {
				r.Get("/", purchasingH.ListGoodsReceipts)
				r.Post("/", purchasingH.RecordGoodsReceipt)
				r.Get("/{id}", purchasingH.GetGoodsReceipt)
			})

			r.Route("/supplier-invoices", func(r chi.Router) {
				r.Get("/next-number", invoicesH.NextNumber)
				r.Get("/", invoicesH.List)
				r.Post("/", invoicesH.Create)
				r.Get("/{id}", invoicesH.GetByID)
			})

			r.Route("/payments", func(r chi.Router) {
				r.Get("/", invoicesH.ListPayments)
				r.Post("/", invoicesH.RecordPayment)
				r.Get("/{id}", invoicesH.GetPayment)
				r.Post("/{id}/cancel", invoicesH.CancelPayment)
			})

			r.Route("/customer-invoices", func(r chi.Router) {
				r.Get("/", salesH.ListCustomerInvoices)
				r.Post("/", salesH.CreateCustomerInvoice)
			})

			r.Route("/customer-receipts", func(r chi.Router) {
				r.Get("/", salesH.ListCustomerReceipts)
				r.Post("/", salesH.RecordCustomerReceipt)
			})

			r.Route("/sales-orders", func(r chi.Router) {
				r.Get("/", salesH.List)
				r.Post("/", salesH.Create)
				r.Get("/{id}", salesH.GetByID)
				r.Patch("/{id}", salesH.Update)
				// PATCH RBAC: hanya owner/admin/sales yang boleh DELETE sales order
				r.With(middleware.RequireRole(pool, "owner", "admin", "sales")).Delete("/{id}", salesH.Delete)
				r.Post("/{id}/submit", salesH.Submit)
				r.Post("/{id}/checkout", salesH.Checkout)
				r.Post("/{id}/deliver", salesH.Deliver)
				r.Post("/{id}/cancel", salesH.Cancel)
			})

			r.Route("/approvals", func(r chi.Router) {
				r.Get("/inbox", approvalsH.PendingInbox)
				r.Get("/by-document/{type}/{id}", approvalsH.GetByDocument)
				r.Get("/{id}", approvalsH.GetInstance)
				r.Post("/{id}/decide", approvalsH.Decide)
			})

			r.Route("/cash-accounts", func(r chi.Router) {
				r.Get("/", financeH.ListCashAccounts)
				r.Post("/", financeH.CreateCashAccount)
				r.Get("/{id}", financeH.GetCashAccount)
				r.Patch("/{id}", financeH.UpdateCashAccount)
				r.Patch("/{id}/status", financeH.SetCashAccountActive)
				r.Delete("/{id}", financeH.DeleteCashAccount)
			})

			r.Route("/fx-rates", func(r chi.Router) {
				r.Get("/", fxH.List)
				r.Get("/latest", fxH.Latest)
				r.Post("/", fxH.Upsert)
			})

			// PATCH RBAC: /dev group hanya untuk role developer
			r.Route("/dev", func(r chi.Router) {
				r.Use(middleware.RequireRole(pool, "developer"))
				r.Get("/me", devH.Me)
				r.Get("/metrics", devH.Metrics)
				r.Get("/logs", devH.Logs)
				r.Get("/disk", devH.Disk)
				r.Get("/analytics", devH.Analytics)
			})

			// PATCH RBAC: audit-logs hanya untuk developer + auditor
			r.With(middleware.RequireRole(pool, "developer", "auditor")).Get("/audit-logs", auditH.List)

			r.Get("/dashboard/summary", dashboardH.Summary)

			r.Route("/users", func(r chi.Router) {
				r.Get("/me", usersH.Me)
				r.Patch("/me", usersH.UpdateMe)
				r.Post("/me/avatar", usersH.UploadAvatar)
				r.Get("/me/avatar", usersH.GetAvatar)
			})
		})
	})

	return r
}

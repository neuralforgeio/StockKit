package main

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/golang-migrate/migrate/v4"
	pgmigrate "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/config"
	fieldcipher "github.com/neuralforgeio/StockKit/internal/crypto"
	"github.com/neuralforgeio/StockKit/internal/httpapi"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/httpapi/middleware"
	"github.com/neuralforgeio/StockKit/internal/logging"
	"github.com/neuralforgeio/StockKit/internal/platform/version"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
	"github.com/neuralforgeio/StockKit/internal/store/redisx"
	"github.com/neuralforgeio/StockKit/migrations"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "serve":
		return serve()
	case "migrate":
		return migrateCmd(args[1:])
	case "seed":
		return seedCmd()
	case "version":
		info := version.Get()
		fmt.Printf("%s (commit %s, built %s)\n", info.Version, info.Commit, info.BuildDate)
		return nil
	default:
		return fmt.Errorf("unknown command %q (expected serve, migrate, seed, or version)", cmd)
	}
}

func serve() error {
	// Load .env dari backend/.env (godotenv aman bila file tidak ada)
	_ = godotenv.Load()

	logger := logging.NewLogger(slog.LevelInfo, "./logs")
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pg.NewPool(ctx, cfg.Postgres.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := waitFor(ctx, "postgres", func() error { return pool.Ping(ctx) }); err != nil {
		return err
	}

	rdb := redisx.New(cfg.RedisAddr)
	defer func() { _ = rdb.Close() }()
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Warn("redis unavailable at startup; continuing degraded", "error", err)
	}

	var cipher *fieldcipher.Cipher
	if cfg.FieldEncryptionKey != "" {
		cipher, err = fieldcipher.New(cfg.FieldEncryptionKey)
		if err != nil {
			return fmt.Errorf("init field cipher: %w", err)
		}
	} else {
		logger.Warn("FIELD_ENCRYPTION_KEY not set; supplier bank accounts cannot be stored")
	}

	var kp *auth.KeyPair
	if cfg.JWTSigningKey != "" {
		kp, err = auth.KeyPairFromSeed(cfg.JWTSigningKey)
		if err != nil {
			return err
		}
		logger.Info("loaded persistent EdDSA signing key", "kid", kp.KID)
	} else {
		kp, err = auth.GenerateKeyPair()
		if err != nil {
			return fmt.Errorf("generate signing key: %w", err)
		}
		if cfg.DebugMode {
			logger.Warn("JWT_EDDSA_KEY not set; sessions will not survive restarts", "kid", kp.KID)
		} else {
			logger.Info("generated EdDSA signing key", "kid", kp.KID)
		}
	}

	// Wire debug mode ke error handler dan logger
	httperr.SetDebugMode(cfg.DebugMode)
	middleware.SetDebugMode(cfg.DebugMode)
	if cfg.DebugMode {
		logger.Warn("DEBUG MODE ACTIVE: stack traces & raw errors exposed to clients", "env", cfg.Env)
	} else {
		logger.Info("production mode: errors sanitized for end users")
	}

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.APIPort),
		Handler:           httpapi.New(logger, pool, rdb, kp, cipher),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	logger.Info("api listening", "addr", srv.Addr, "env", cfg.Env)

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case err := <-errCh:
		return fmt.Errorf("http server: %w", err)
	}

	shCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(shCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}
	logger.Info("server stopped cleanly")
	return nil
}

func migrateCmd(args []string) error {
	// Load .env dari backend/.env
	_ = godotenv.Load()

	sub := "up"
	if len(args) > 0 {
		sub = args[0]
	}

	cfg := config.Load()
	source, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("migration source: %w", err)
	}

	db, err := sql.Open("postgres", cfg.Postgres.DSN())
	if err != nil {
		return fmt.Errorf("open migration db: %w", err)
	}
	defer func() { _ = db.Close() }()

	driver, err := pgmigrate.WithInstance(db, &pgmigrate.Config{})
	if err != nil {
		return fmt.Errorf("migration driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", source, "postgres", driver)
	if err != nil {
		return fmt.Errorf("init migrate: %w", err)
	}

	switch sub {
	case "up":
		err = m.Up()
	case "down":
		err = m.Steps(-1)
	case "force":
		if len(args) < 2 {
			return fmt.Errorf("usage: migrate force <version>")
		}
		v, perr := strconv.Atoi(args[1])
		if perr != nil {
			return fmt.Errorf("invalid version: %w", perr)
		}
		if err := m.Force(v); err != nil {
			return fmt.Errorf("migrate force: %w", err)
		}
		fmt.Printf("forced version %d (dirty cleared)\n", v)
		return nil
	case "version":
		v, dirty, verr := m.Version()
		if errors.Is(verr, migrate.ErrNilVersion) {
			fmt.Println("no migrations applied")
			return nil
		}
		if verr != nil {
			return verr
		}
		fmt.Printf("version=%d dirty=%t\n", v, dirty)
		return nil
	default:
		return fmt.Errorf("unknown migrate subcommand %q (expected up, down, force, or version)", sub)
	}

	if errors.Is(err, migrate.ErrNoChange) {
		fmt.Println("no migrations to apply")
		return nil
	}
	if err != nil {
		return fmt.Errorf("migrate %s: %w", sub, err)
	}
	fmt.Println("migrations applied successfully")
	return nil
}

// randomPassword generates a cryptographically-random password (no hardcoded secret).
func randomPassword(n int) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
	b := make([]byte, n)
	for i := range b {
		idx, err := crand.Int(crand.Reader, big.NewInt(int64(len(chars))))
		if err != nil {
			b[i] = 'x'
			continue
		}
		b[i] = chars[idx.Int64()]
	}
	return string(b)
}

func seedCmd() error {
	// Load .env dari backend/.env
	_ = godotenv.Load()

	cfg := config.Load()
	ctx := context.Background()
	pool, err := pg.NewPool(ctx, cfg.Postgres.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()

	tenantID := "00000000-0000-0000-0000-000000000001"

	_, err = pool.Exec(ctx, `
		INSERT INTO tenants (id, legal_name, address, tax_id, base_currency, default_locale)
		VALUES ($1, 'PT Sinar Mitra Teknologi', 'Jl. Sudirman No. 1', '01.234.567.8-901.000', 'IDR', 'id')
		ON CONFLICT (id) DO UPDATE SET legal_name = EXCLUDED.legal_name`, tenantID)
	if err != nil {
		return fmt.Errorf("seed tenant: %w", err)
	}
	fmt.Println("✓ Tenant: PT Sinar Mitra Teknologi")

	roles := []string{"developer", "owner", "admin", "finance", "sales", "purchasing", "warehouse", "auditor"}
	roleIDs := make(map[string]string)
	for i, name := range roles {
		roleID := fmt.Sprintf("00000000-0000-0000-0000-0000000001%02d", i+1)
		roleIDs[name] = roleID
		_, err = pool.Exec(ctx, `
			INSERT INTO roles (id, tenant_id, name, description)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
			roleID, tenantID, name, fmt.Sprintf("%s role", name))
		if err != nil {
			return fmt.Errorf("seed role %s: %w", name, err)
		}
	}
	fmt.Println("✓ Roles seeded")

	// Credentials from env; generate random password if not provided (no hardcoded secret).
	devEmail := os.Getenv("SEED_DEV_EMAIL")
	if devEmail == "" {
		devEmail = "developer@stockkit.local"
	}
	devPassword := os.Getenv("SEED_DEV_PASSWORD")
	generated := false
	if devPassword == "" {
		devPassword = randomPassword(16)
		generated = true
	}

	var devUserID string
	devHash, err := auth.HashPassword(devPassword)
	if err != nil {
		return fmt.Errorf("hash developer password: %w", err)
	}

	err = pool.QueryRow(ctx, `
		INSERT INTO users (tenant_id, email, password_hash, full_name, status, perm_version)
		VALUES ($1, $2, $3, $4, 'active', 1)
		ON CONFLICT (email) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			full_name = EXCLUDED.full_name,
			status = 'active',
			perm_version = users.perm_version + 1
		RETURNING id`,
		tenantID, devEmail, devHash, "StockKit Developer").Scan(&devUserID)
	if err != nil {
		return fmt.Errorf("seed developer user: %w", err)
	}
	fmt.Printf("✓ Developer: %s (ID: %s)\n", devEmail, devUserID)
	if generated {
		fmt.Printf("\n⚠ SEED_DEV_PASSWORD not set. One-time developer password:\n   %s\n   Store it now — it is NOT stored or printed again.\n\n", devPassword)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO user_roles (tenant_id, user_id, role_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
		tenantID, devUserID, roleIDs["developer"])
	if err != nil {
		return fmt.Errorf("grant developer role: %w", err)
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO user_roles (tenant_id, user_id, role_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
		tenantID, devUserID, roleIDs["owner"])
	if err != nil {
		return fmt.Errorf("grant owner role: %w", err)
	}
	fmt.Println("✓ Roles granted (developer + owner)")

	units := []struct{ id, code, name string }{
		{"00000000-0000-0000-0000-000000000301", "PCS", "Piece"},
		{"00000000-0000-0000-0000-000000000302", "UNIT", "Unit"},
		{"00000000-0000-0000-0000-000000000303", "BOX", "Box"},
		{"00000000-0000-0000-0000-000000000304", "KG", "Kilogram"},
		{"00000000-0000-0000-0000-000000000305", "LTR", "Liter"},
		{"00000000-0000-0000-0000-000000000306", "MTR", "Meter"},
		{"00000000-0000-0000-0000-000000000307", "SET", "Set"},
		{"00000000-0000-0000-0000-000000000308", "SRV", "Service"},
	}
	for _, u := range units {
		_, err = pool.Exec(ctx, `INSERT INTO units (id, tenant_id, code, name) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, u.id, tenantID, u.code, u.name)
		if err != nil {
			return fmt.Errorf("seed unit %s: %w", u.code, err)
		}
	}
	fmt.Println("✓ Default units seeded")

	warehouses := []struct{ id, code, name, branch string }{
		{"00000000-0000-0000-0000-000000000401", "WH-JKT-01", "Jakarta Main Warehouse", "Jakarta"},
		{"00000000-0000-0000-0000-000000000402", "WH-BDG-02", "Bandung Distribution Center", "Bandung"},
	}
	for _, wh := range warehouses {
		_, err = pool.Exec(ctx, `INSERT INTO warehouses (id, tenant_id, code, name, branch) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, wh.id, tenantID, wh.code, wh.name, wh.branch)
		if err != nil {
			return fmt.Errorf("seed warehouse %s: %w", wh.code, err)
		}
	}
	fmt.Println("✓ Default warehouses seeded")

	catElectronics := "00000000-0000-0000-0000-000000000501"
	catServices := "00000000-0000-0000-0000-000000000502"
	catLaptops := "00000000-0000-0000-0000-000000000503"
	catAccessories := "00000000-0000-0000-0000-000000000504"
	catPaper := "00000000-0000-0000-0000-000000000505"
	for _, c := range []struct{ id, name, parent string }{
		{catElectronics, "Electronics", ""}, {catServices, "Services", ""},
		{catLaptops, "Laptops", catElectronics}, {catAccessories, "Accessories", catElectronics}, {catPaper, "Paper", catElectronics},
	} {
		if c.parent == "" {
			_, err = pool.Exec(ctx, `INSERT INTO categories (id, tenant_id, name) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, c.id, tenantID, c.name)
		} else {
			_, err = pool.Exec(ctx, `INSERT INTO categories (id, tenant_id, name, parent_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, c.id, tenantID, c.name, c.parent)
		}
		if err != nil {
			return fmt.Errorf("seed categories: %w", err)
		}
	}
	fmt.Println("✓ Default categories seeded")

	customers := []struct{ id, code, name, typ string }{
		{"00000000-0000-0000-0000-000000000601", "CUS-001", "PT Cahaya Retail Nusantara", "company"},
		{"00000000-0000-0000-0000-000000000602", "CUS-002", "CV Berkah Abadi", "company"},
		{"00000000-0000-0000-0000-000000000603", "CUS-003", "Toko Sumber Rejeki", "individual"},
	}
	for _, c := range customers {
		_, err = pool.Exec(ctx, `INSERT INTO customers (id, tenant_id, code, name, type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, c.id, tenantID, c.code, c.name, c.typ)
		if err != nil {
			return fmt.Errorf("seed customer %s: %w", c.code, err)
		}
	}
	fmt.Println("✓ Default customers seeded")

	suppliers := []struct{ id, code, name string }{
		{"00000000-0000-0000-0000-000000000701", "SUP-001", "PT Distribusi Teknologi Indonesia"},
		{"00000000-0000-0000-0000-000000000702", "SUP-002", "CV Sumber Elektronik Jaya"},
	}
	for _, s := range suppliers {
		_, err = pool.Exec(ctx, `INSERT INTO suppliers (id, tenant_id, code, name) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`, s.id, tenantID, s.code, s.name)
		if err != nil {
			return fmt.Errorf("seed supplier %s: %w", s.code, err)
		}
	}
	fmt.Println("✓ Default suppliers seeded")

	_, err = pool.Exec(ctx, `
		INSERT INTO code_sequences (tenant_id, prefix, last_value)
		VALUES ($1,'CUS',3),($1,'SUP',2)
		ON CONFLICT (tenant_id, prefix) DO UPDATE SET last_value = GREATEST(code_sequences.last_value, EXCLUDED.last_value)`, tenantID)
	if err != nil {
		return fmt.Errorf("sync code sequences: %w", err)
	}
	fmt.Println("✓ Code sequences synchronized")

	tpProductID := "00000000-0000-0000-0000-000000000801"
	whJktID := "00000000-0000-0000-0000-000000000401"
	unitPCS := "00000000-0000-0000-0000-000000000301"
	adjSeedID := "00000000-0000-0000-0000-000000000901"

	_, err = pool.Exec(ctx, `
		INSERT INTO products (id, tenant_id, sku, name, unit_id, type, cost_method, default_sell_price_minor, default_buy_price_minor)
		VALUES ($1,$2,'LP-TP-E14-5','ThinkPad E14 Gen 5',$3,'product','average',12500000,9500000)
		ON CONFLICT (id) DO NOTHING`, tpProductID, tenantID, unitPCS)
	if err != nil {
		return fmt.Errorf("seed thinkpad product: %w", err)
	}

	var currentOnHand int64
	_ = pool.QueryRow(ctx, `SELECT on_hand FROM stock_levels WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3`, tenantID, tpProductID, whJktID).Scan(&currentOnHand)
	if currentOnHand == 0 {
		_, err = pool.Exec(ctx, `INSERT INTO stock_adjustments (id, tenant_id, number, reason, created_by) VALUES ($1,$2,'ADJ-0001','Initial seed stock',$3) ON CONFLICT (id) DO NOTHING`, adjSeedID, tenantID, devUserID)
		if err != nil {
			return fmt.Errorf("seed adjustment document: %w", err)
		}
		_, err = pool.Exec(ctx, `INSERT INTO stock_levels (tenant_id, product_id, warehouse_id, on_hand, avg_cost_minor) VALUES ($1,$2,$3,25,9500000) ON CONFLICT (tenant_id,product_id,warehouse_id) DO NOTHING`, tenantID, tpProductID, whJktID)
		if err != nil {
			return fmt.Errorf("seed stock levels: %w", err)
		}
		var seq int64
		if err := pool.QueryRow(ctx, `SELECT nextval('movement_seq')`).Scan(&seq); err != nil {
			return fmt.Errorf("nextval movement_seq seed: %w", err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO inventory_movements (tenant_id, movement_seq, document_type, document_id, movement_type, product_id, warehouse_id, qty, unit_cost_minor, balance_after, actor_user_id)
			VALUES ($1,$2,'ADJ',$3,'ADJ_IN',$4,$5,25,9500000,25,$6)`, tenantID, seq, adjSeedID, tpProductID, whJktID, devUserID)
		if err != nil {
			return fmt.Errorf("seed initial movement: %w", err)
		}
		_, err = pool.Exec(ctx, `INSERT INTO code_sequences (tenant_id, prefix, last_value) VALUES ($1,'ADJ',1) ON CONFLICT (tenant_id,prefix) DO UPDATE SET last_value=GREATEST(code_sequences.last_value,EXCLUDED.last_value)`, tenantID)
		if err != nil {
			return fmt.Errorf("sync adjustment sequence: %w", err)
		}
		fmt.Println("✓ Initial stock seeded (ThinkPad E14 Gen 5 x 25 @ WH-JKT-01)")
	}

	fmt.Println("\n✓ Seed completed successfully.")
	return nil
}

func waitFor(ctx context.Context, name string, probe func() error) error {
	const attempts = 15
	var last error
	for i := 0; i < attempts; i++ {
		if last = probe(); last == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("wait for %s canceled: %w", name, ctx.Err())
		case <-time.After(time.Second):
		}
	}
	return fmt.Errorf("wait for %s: %w", name, last)
}

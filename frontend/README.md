<div align="center">

# 📦 StockKit

**Multi-tenant Business Operations Platform** — inventory, purchasing, sales,
finance, payments, approval workflows, and reporting for Indonesian companies
(from UMKM to project-based enterprises).

<p>
  <img src="https://img.shields.io/badge/Go-1.27-00ADD8?style=flat-square&logo=go" alt="Go"/>
  <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js" alt="Next"/>
  <img src="https://img.shields.io/badge/PostgreSQL-18-336791?style=flat-square&logo=postgresql" alt="PG"/>
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis" alt="Redis"/>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT"/>
</p>

</div>

---

## ✨ Features

- **🗃️ Inventory** — multi-warehouse stock levels, FIFO/Average costing, adjustments, full movement audit trail.
- **🛒 Purchasing** — purchase request → approval → PO → goods receipt → supplier invoice.
- **💰 Sales** — sales order → checkout (reserve) → deliver → customer invoice → receipt (order-to-cash).
- **🏦 Finance** — cash accounts, payments, AR/AP aging, net working capital, FX rates.
- **✅ Approvals** — multi-step, threshold-based approval workflows with finalizer hooks.
- **📊 Reports** — P&L, inventory valuation, AR/AP aging, signed PDF/Excel export.
- **👥 RBAC** — roles: developer, owner, admin, finance, sales, purchasing, warehouse, auditor.
- **🔐 Security** — AES-256-GCM encrypted supplier bank accounts, JWT refresh rotation + reuse detection, CSRF, structured colored logs with PII redaction.

## 🏗️ Architecture

```
frontend (Next.js 16, React, Tailwind, Recharts)
        │  HTTPS /api/v1
backend (Go, Chi, pgx, slog) ── PostgreSQL 18
        │                       └─ Redis 7 (degraded-tolerant)
        └─ MinIO (S3, images)
```

## 🚀 Quick Start

```bash
cp .env.example .env        # then set strong passwords
docker compose up -d        # postgres, redis, minio

cd backend
go mod tidy
go run ./cmd/api migrate up
go run ./cmd/api seed       # seeds tenant, roles, units, warehouses, demo catalog
go run ./cmd/api serve      # :8080

# separate terminal
cd frontend
npm install
npm run dev                 # :3000
```

### Seeded developer account

The seed creates a developer account. Credentials are **not hardcoded**:

- `SEED_DEV_EMAIL` (default `developer@stockkit.local`)
- `SEED_DEV_PASSWORD` — if unset, a random password is generated and printed **once** at seed time.

## 🧰 CLI

```bash
go run ./cmd/api serve            # start API
go run ./cmd/api migrate up       # apply migrations
go run ./cmd/api migrate down     # rollback one
go run ./cmd/api migrate force N  # fix dirty state
go run ./cmd/api migrate version  # show version
go run ./cmd/api seed             # seed initial data
```

## 📁 Project Structure

```
backend/
  cmd/api/            # entrypoint (serve/migrate/seed)
  internal/
    approval/         # approval engine + finalizer hooks
    auth/             # JWT EdDSA, refresh rotation
    crypto/           # AES-256-GCM field cipher
    inventory/ purchasing/ sales/ finance/ fx/
    httpapi/          # router, handlers, middleware
    logging/          # colored rotating structured logs
frontend/
  app/                # Next.js app router pages
  components/         # UI primitives + layout
  lib/                # API client, exporters (PDF/Excel)
docs/                 # API, architecture, deployment docs
infra/postgres/       # db init
```

##  Documentation

- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security](docs/SECURITY.md)

## 🤝 Contributing

Fork → branch → commit (Conventional Commits) → PR. See [docs](docs/).

## 📄 License

MIT — see [LICENSE](LICENSE).

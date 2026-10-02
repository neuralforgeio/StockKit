# StockKit

Multi-tenant business operations platform: inventory, purchasing, sales,
finance, payments, and reporting for Indonesian companies from UMKM to
project-based businesses.

## Status

Current version: 1.0.0 (development). Milestone M0-FOUND: platform
foundation (API skeleton, health endpoints, core platform schema).

## API

All application routes are versioned under `/api/v1/`.

- `GET /api/v1/healthz` — liveness
- `GET /api/v1/readyz` — readiness (PostgreSQL required, Redis degraded-tolerant)
- `GET /api/v1/version` — build and runtime information

## Stack

Go 1.27.1 · Next.js 16.3.4 · PostgreSQL 18.6 · Redis 7 · MinIO · Docker Compose

## Quick start

```bash
cp .env.example .env        # then change every password
docker compose up -d

cd backend
go mod tidy
go run ./cmd/api migrate up
go run ./cmd/api serve

# separate terminal
cd frontend
npm install
npm run dev

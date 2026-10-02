# 🏛️ StockKit Architecture

## System Overview

```mermaid
flowchart TB
    User((User)) -->|Browser| FE[Next.js Frontend]
    FE -->|REST API| BE[Go Backend]

    subgraph BE[Go Backend - Chi Router]
        direction TB
        MW[Middleware Layer]
        H[Handlers]
        S[Services]
        R[Repositories]
    end

    MW --> H --> S --> R

    R --> PG[(PostgreSQL 18)]
    R --> REDIS[(Redis 7)]
    R --> MINIO[(MinIO S3)]

    H --> LOGS[./logs/stockkit-*.log]
    H --> LOGS2[./logs/stockkit-*.jsonl]
```

---

## Module Boundaries

```mermaid
flowchart LR
    subgraph Master[Master Data]
        P[Products]
        U[Units]
        C[Categories]
        W[Warehouses]
        CU[Customers]
        SU[Suppliers]
    end

    subgraph Trans[Transactions]
        INV[Inventory]
        PUR[Purchasing]
        SAL[Sales]
        FIN[Finance]
    end

    subgraph Plat[Platform]
        AUTH[Auth]
        NOT[Notifications]
        APR[Approvals]
        FX[FX Rates]
        DEV[Dev Suite]
    end

    Master --> Trans
    Trans --> Plat
```

---

## Data Flow: Sales Order Lifecycle

```mermaid
sequenceDiagram
    participant U as Sales User
    participant SO as SalesOrder Service
    participant APR as Approval Service
    participant INV as Inventory Service
    participant FIN as Finance Service
    participant DB as PostgreSQL

    U->>SO: POST /sales-orders (draft)
    SO->>DB: INSERT sales_orders (status=draft)
    DB-->>SO: sales_order_id
    SO-->>U: 201 Created

    U->>SO: PATCH /sales-orders/{id} (edit)
    SO->>DB: UPDATE + replace lines
    DB-->>SO: OK

    U->>SO: POST /sales-orders/{id}/submit
    SO->>APR: CreateInstance (evaluates rules)
    alt amount >= threshold
        APR->>DB: INSERT approval_instances + steps
        APR-->>SO: pending
    else below threshold
        APR-->>SO: auto-approved
    end
    SO->>DB: UPDATE status=submitted
    SO-->>U: 200

    Note over APR: Approver reviews

    U->>APR: POST /approvals/{id}/decide (approved)
    APR->>DB: UPDATE step.decision=approved
    APR->>DB: UPDATE instance.status=approved (if all steps done)
    APR-->>U: 200

    U->>SO: POST /sales-orders/{id}/checkout
    SO->>INV: Reserve stock (UPDATE reserved)
    INV->>DB: UPDATE stock_levels.reserved += qty
    SO->>DB: UPDATE status=reserved
    SO-->>U: 200

    U->>SO: POST /sales-orders/{id}/deliver
    SO->>INV: Record OUT movement
    INV->>DB: INSERT inventory_movements
    INV->>DB: UPDATE stock_levels (on_hand--, reserved--)
    INV->>DB: INSERT FIFO layers (if FIFO product)
    SO->>DB: UPDATE status=delivered
    SO-->>U: 200

    U->>FIN: POST /customer-invoices
    FIN->>DB: INSERT customer_invoices (status=open, AR)
    FIN-->>U: 201

    U->>FIN: POST /customer-receipts
    FIN->>DB: INSERT customer_receipts
    FIN->>DB: UPDATE cash_accounts.balance += amount
    FIN->>DB: UPDATE customer_invoices.paid_minor, status
    FIN-->>U: 201
```

---

## Multi-Tenant Isolation

Every query includes `tenant_id` filter. The `auth.Claims` carries the tenant from JWT, propagated to every repository call.

```go
// Repository signature pattern
func (r *Repository) List(ctx context.Context, tenantID string) ([]Entity, error) {
    return r.pool.Query(ctx, `SELECT ... WHERE tenant_id = $1`, tenantID)
}
```

**Tenant boundaries:**
- Each tenant has its own sequence generators (`code_sequences`)
- Warehouse, customer, supplier, product IDs are unique per tenant
- User roles scoped per tenant (`user_roles`)
- Approval rules tenant-specific

---

## Costing Methods

### Average Costing (default)

```sql
-- On ADJ_IN or GR_IN
UPDATE stock_levels
SET on_hand = on_hand + qty,
    avg_cost_minor = (
        (on_hand * avg_cost_minor) + (qty * unit_cost)
    ) / (on_hand + qty)
WHERE product_id = $1 AND warehouse_id = $2
```

### FIFO Costing

Uses `inventory_cost_layers` table:
- Each IN movement creates a new layer (ordered by `movement_seq`)
- OUT movements consume layers in FIFO order (oldest first)
- `cogs_minor` on OUT = sum of consumed layer costs

---

## Logging Architecture

```mermaid
flowchart LR
    REQ[HTTP Request] --> MW[ColoredLogger middleware]
    MW --> SL[slog.Logger]
    SL --> FAN[fanout handler]

    FAN --> CON[stdout - colored]
    FAN --> LOG[./logs/stockkit-DATE.log - colored]
    FAN --> JSON[./logs/stockkit-DATE.jsonl - JSON]

    JSON --> DEV[/dev/logs API/]
    JSON --> PARSE[parsable by jq/Loki]
```

**Redaction:** `password`, `token`, `refresh_token`, `credit_card`, `secret`, `authorization`, `cookie`, `otp`, `pin` — all replaced with `[REDACTED]` before printing.

**Rotation:** New file daily at midnight. Old files preserved (manual `logrotate` recommended for production).

---

## Approval Workflow Engine

```mermaid
flowchart TD
    DOC[Document submitted] --> EVAL{Evaluate rules}
    EVAL -->|amount >= threshold| CREATE[Create approval instance]
    EVAL -->|below threshold| AUTO[Auto-approve]

    CREATE --> STEP1[Create step 1: manager]
    CREATE --> STEP2[Create step 2: director if amount > 50jt]

    STEP1 --> NOTIFY[Notify approvers]
    NOTIFY --> DECIDE{Approver decides}

    DECIDE -->|approved| NEXT{More steps?}
    DECIDE -->|rejected| REJECT[Instance = rejected]

    NEXT -->|yes| WAIT[Wait for next approver]
    NEXT -->|no| APPROVE[Instance = approved]

    APPROVE --> HOOK[Hook: update document status]
    REJECT --> HOOK2[Hook: notify requester]
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant BE as Backend
    participant DB as PostgreSQL

    C->>BE: POST /auth/login {email, password}
    BE->>DB: SELECT user by email
    DB-->>BE: user row
    BE->>BE: bcrypt compare
    BE->>BE: Generate access_token (EdDSA, 15min)
    BE->>BE: Generate refresh_token (EdDSA, 7d / 30d)
    BE->>DB: INSERT refresh_token_families
    BE-->>C: Set-Cookie: access_token, refresh_token
    BE-->>C: {csrf_token}

    Note over C,BE: Authenticated requests
    C->>BE: GET /products (Bearer + CSRF)
    BE->>BE: Verify access_token signature
    BE-->>C: 200 OK

    Note over C,BE: Access token expired (401)
    C->>BE: POST /auth/refresh
    BE->>DB: Validate refresh family
    BE->>DB: Rotate (invalidate old, issue new)
    BE-->>C: New tokens

    Note over C,BE: Reuse detection
    C->>BE: POST /auth/refresh (old token)
    BE->>DB: Detect reuse → revoke entire family
    BE-->>C: 401 (session killed)
```

---

## Database Schema Highlights

### Core Tables

- `tenants` — root of multi-tenancy
- `users`, `roles`, `user_roles` — RBAC
- `products`, `categories`, `units` — catalog
- `warehouses`, `stock_levels`, `inventory_movements`, `inventory_cost_layers` — inventory
- `sales_orders`, `sales_order_lines` — sales
- `customer_invoices`, `customer_receipts` — AR
- `purchase_requests`, `purchase_orders`, `goods_receipts`, `supplier_invoices`, `payments` — AP
- `approval_instances`, `approval_steps`, `approval_rules` — workflow
- `fx_rates` — currency
- `notifications` — in-app messaging
- `code_sequences` — auto-number allocators

### Indexes

All foreign keys indexed. Common queries (tenant_id + status, tenant_id + created_at) have composite indexes.

### Migrations

Managed by `golang-migrate`. Sequential files:
```
migrations/
├── 000001_init_platform.up.sql
├── 000001_init_platform.down.sql
├── 000002_inventory.up.sql
...
└── 000022_fx_rates.up.sql
```

---

## Frontend Architecture

```
frontend/app/
├── (auth)/
│   └── login/page.tsx
└── (app)/
    ├── layout.tsx          # Authenticated layout (sidebar + topbar)
    ├── page.tsx            # Dashboard
    ├── products/
    ├── inventory/
    ├── purchasing/
    ├── sales/
    ├── finance/
    │   ├── accounts/
    │   └── fx/
    ├── reports/
    ├── developer/
    └── settings/
```

### Component Patterns

- **`components/ui/`** — primitives (Button, Modal, KpiCard, Toast, etc.)
- **`components/layout/`** — Sidebar, Topbar, ProfileMenu
- **`lib/api/`** — typed API client modules
- **`lib/export/`** — PDF (jsPDF) + Excel (exceljs) exporters

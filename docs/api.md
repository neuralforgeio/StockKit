# 📘 StockKit API Reference

Base URL: `http://localhost:8080/api/v1`

All endpoints require:
- **Bearer token** in `Authorization: Bearer <access_token>` header (except auth routes)
- **CSRF token** in `X-CSRF-Token` header for state-changing requests

---

## Table of Contents

- [Authentication](#authentication)
- [Health & System](#health--system)
- [Users](#users)
- [Notifications](#notifications)
- [Dashboard](#dashboard)
- [Products](#products)
- [Units](#units)
- [Categories](#categories)
- [Warehouses](#warehouses)
- [Customers](#customers)
- [Suppliers](#suppliers)
- [Inventory](#inventory)
- [Purchasing](#purchasing)
- [Sales](#sales)
- [Finance](#finance)
- [Approvals](#approvals)
- [FX Rates](#fx-rates)
- [Developer](#developer)

---

## Authentication

### `POST /auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "dearlyfebrianoi@gmail.com",
  "password": "dearlyfebriano08",
  "remember": true
}
```

**Response (200):** Sets `access_token` and `refresh_token` cookies (httpOnly), returns CSRF token.

```json
{
  "access_token": "eyJ...",
  "csrf_token": "abc123",
  "expires_at": "2026-10-03T10:00:00Z"
}
```

---

### `POST /auth/refresh`
Rotate access + refresh tokens.

**Headers:** `Authorization: Bearer <old_access_token>`, `Cookie: refresh_token=...`

**Response (200):** New tokens set in cookies.

---

### `POST /auth/logout`
Revoke refresh token family.

**Response (204):** Cookies cleared.

---

### `GET /auth/me`
Get current user info.

**Response (200):**
```json
{
  "id": "00000000-...",
  "email": "user@example.com",
  "full_name": "Dearly Febriano",
  "roles": ["developer", "owner"],
  "tenant_id": "00000000-..."
}
```

---

## Health & System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Liveness probe (200 if process alive) |
| `GET` | `/readyz` | Readiness (200 if PostgreSQL connected; Redis optional) |
| `GET` | `/version` | Build info: version, commit, build date, Go version |

---

## Users

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users/me` | Current user profile |
| `PATCH` | `/users/me` | Update profile (name, phone) |
| `POST` | `/users/me/avatar` | Upload avatar (multipart) |
| `GET` | `/users/me/avatar` | Get avatar image |

---

## Notifications

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications` | List notifications (paginated) |
| `GET` | `/notifications/unread-count` | Unread count |
| `POST` | `/notifications/read-all` | Mark all read |
| `POST` | `/notifications/{id}/read` | Mark one read |

---

## Dashboard

### `GET /dashboard/summary`
Aggregated KPIs for dashboard widgets.

**Response (200):**
```json
{
  "revenue_mtd": 125000000,
  "cogs_mtd": 75000000,
  "inventory_value": 450000000,
  "open_ar": 50000000,
  "open_ap": 30000000,
  "low_stock_count": 12,
  "pending_approvals": 3
}
```

---

## Products

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/products` | List with pagination (`?page=1&limit=50`) |
| `POST` | `/products` | Create product |
| `GET` | `/products/next-sku` | Next auto-generated SKU |
| `GET` | `/products/{id}` | Get product by ID |
| `PATCH` | `/products/{id}` | Update product |
| `DELETE` | `/products/{id}` | Delete product |
| `POST` | `/products/{id}/images` | Upload product image (multipart) |
| `GET` | `/products/{id}/images` | List product images |
| `GET` | `/product-images/{id}/content` | Get image binary |
| `DELETE` | `/product-images/{id}` | Delete image |
| `POST` | `/product-images/{id}/set-primary` | Set image as primary |

### Create Product

```json
{
  "sku": "LP-TP-E14-5",
  "name": "ThinkPad E14 Gen 5",
  "category_id": "00000000-...",
  "unit_id": "00000000-...",
  "type": "product",
  "cost_method": "average",
  "default_sell_price_minor": 12500000,
  "default_buy_price_minor": 9500000
}
```

---

## Units

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/units` | List all units |
| `POST` | `/units` | Create unit |
| `PATCH` | `/units/{id}` | Update unit |
| `DELETE` | `/units/{id}` | Delete unit |

---

## Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/categories` | List (hierarchical) |
| `POST` | `/categories` | Create |
| `GET` | `/categories/{id}` | Get |
| `PATCH` | `/categories/{id}` | Update |
| `PATCH` | `/categories/{id}/status` | Set active/inactive |
| `DELETE` | `/categories/{id}` | Delete |

---

## Warehouses

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/warehouses` | List |
| `POST` | `/warehouses` | Create |
| `GET` | `/warehouses/{id}` | Get |
| `PATCH` | `/warehouses/{id}` | Update |
| `PATCH` | `/warehouses/{id}/status` | Activate/deactivate |
| `DELETE` | `/warehouses/{id}` | Delete |

---

## Customers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/customers` | List |
| `POST` | `/customers` | Create |
| `GET` | `/customers/{id}` | Get |
| `PATCH` | `/customers/{id}` | Update |
| `PATCH` | `/customers/{id}/status` | Activate/deactivate |
| `DELETE` | `/customers/{id}` | Delete |

---

## Suppliers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/suppliers` | List (bank account masked) |
| `POST` | `/suppliers` | Create (bank account encrypted with AES-256-GCM) |
| `GET` | `/suppliers/{id}` | Get |
| `PATCH` | `/suppliers/{id}` | Update |
| `PATCH` | `/suppliers/{id}/status` | Activate/deactivate |
| `DELETE` | `/suppliers/{id}` | Delete |

---

## Inventory

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/inventory/stock-levels` | Stock levels per product/warehouse |
| `GET` | `/inventory/movements` | Movements (cursor pagination) |
| `POST` | `/inventory/adjustments` | Record stock adjustment |

### Record Adjustment

```json
{
  "product_id": "00000000-...",
  "warehouse_id": "00000000-...",
  "qty": 10,
  "reason": "Stock take correction",
  "unit_cost_minor": 9500000
}
```

- Positive `qty` = `ADJ_IN` (increases stock, updates average cost)
- Negative `qty` = `ADJ_OUT` (decreases stock, validates `on_hand - reserved >= abs(qty)`)

---

## Purchasing

### Purchase Requests

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/purchase-requests` | List |
| `POST` | `/purchase-requests` | Create draft |
| `GET` | `/purchase-requests/{id}` | Get |
| `PATCH` | `/purchase-requests/{id}` | Update draft |
| `POST` | `/purchase-requests/{id}/submit` | Submit (triggers approval) |
| `POST` | `/purchase-requests/{id}/cancel` | Cancel |
| `POST` | `/purchase-requests/{id}/convert` | Convert to PO |

### Purchase Orders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/purchase-orders` | List |
| `GET` | `/purchase-orders/{id}` | Get |

### Goods Receipts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/goods-receipts` | List |
| `POST` | `/goods-receipts` | Record receipt (IN movement) |
| `GET` | `/goods-receipts/{id}` | Get |

---

## Sales

### Sales Orders

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sales-orders` | List |
| `POST` | `/sales-orders` | Create draft |
| `GET` | `/sales-orders/{id}` | Get |
| `PATCH` | `/sales-orders/{id}` | Update draft |
| `DELETE` | `/sales-orders/{id}` | Delete draft |
| `POST` | `/sales-orders/{id}/submit` | Submit (triggers approval) |
| `POST` | `/sales-orders/{id}/checkout` | Reserve stock |
| `POST` | `/sales-orders/{id}/deliver` | OUT movement + COGS |
| `POST` | `/sales-orders/{id}/cancel` | Cancel |

### Customer Invoices & Receipts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/customer-invoices` | List |
| `POST` | `/customer-invoices` | Create (creates AR) |
| `GET` | `/customer-receipts` | List |
| `POST` | `/customer-receipts` | Record payment (cash in) |

---

## Finance

### Supplier Invoices & Payments

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/supplier-invoices/next-number` | Next auto-number |
| `GET` | `/supplier-invoices` | List |
| `POST` | `/supplier-invoices` | Create (creates AP) |
| `GET` | `/supplier-invoices/{id}` | Get |
| `GET` | `/payments` | List |
| `POST` | `/payments` | Record payment (cash out) |
| `GET` | `/payments/{id}` | Get |
| `POST` | `/payments/{id}/cancel` | Cancel payment |

### Cash Accounts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/cash-accounts` | List |
| `POST` | `/cash-accounts` | Create |
| `GET` | `/cash-accounts/{id}` | Get |
| `PATCH` | `/cash-accounts/{id}` | Update |
| `PATCH` | `/cash-accounts/{id}/status` | Activate/deactivate |
| `DELETE` | `/cash-accounts/{id}` | Delete |

---

## Approvals

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/approvals/inbox` | Pending approvals for current user |
| `GET` | `/approvals/by-document/{type}/{id}` | Approval for a document |
| `GET` | `/approvals/{id}` | Get approval instance |
| `POST` | `/approvals/{id}/decide` | Approve/reject a step |
| `GET` | `/approval-rules` | List rules |
| `POST` | `/approval-rules` | Create rule |
| `PATCH` | `/approval-rules/{id}` | Update rule |
| `DELETE` | `/approval-rules/{id}` | Delete rule |

### Decide on Approval

```json
{
  "step_id": "00000000-...",
  "decision": "approved",
  "reason": "Looks good"
}
```

---

## FX Rates

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/fx-rates` | List all rates |
| `GET` | `/fx-rates/latest?base=USD&quote=IDR` | Latest rate for a pair |
| `POST` | `/fx-rates` | Upsert rate |

### Upsert Rate

```json
{
  "base_currency": "USD",
  "quote_currency": "IDR",
  "rate": 15850.50,
  "effective_date": "2026-10-02"
}
```

---

## Developer (RBAC: `developer` only)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dev/me` | Current user roles |
| `GET` | `/dev/metrics` | Runtime metrics (goroutines, heap, DB pool) |
| `GET` | `/dev/logs?limit=300` | Tail structured logs |
| `GET` | `/dev/disk` | Disk usage (OS + log dir) |
| `GET` | `/dev/analytics` | Request analytics (per-hour, top endpoints, status) |

---

## Error Responses

All errors follow this shape:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Customer is required"
}
```

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `204` | No content (logout, delete) |
| `400` | Bad request |
| `401` | Unauthorized (missing/invalid token) |
| `403` | Forbidden (insufficient role) |
| `404` | Not found |
| `409` | Conflict (insufficient stock, already decided) |
| `422` | Validation failed |
| `500` | Internal server error |

---

## Rate Limiting

- **Authenticated routes:** 100 requests/minute per user
- **Auth routes:** 10 requests/minute per IP (brute-force protection)

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1696234560
```

---

## Pagination

List endpoints support cursor-based pagination:

```
GET /api/v1/products?page=1&limit=50
```

Response includes:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 250,
    "has_next": true,
    "has_prev": false
  }
}
```

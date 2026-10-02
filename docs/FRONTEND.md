# 🎨 Frontend Guide

## Tech Stack

- **Framework:** Next.js 16.3.6 (App Router, Turbopack)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS with design tokens
- **Charts:** Recharts
- **Animations:** Framer Motion
- **HTTP:** Native fetch with typed wrapper

---

## Directory Structure

```
frontend/
├── app/
│   ├── (auth)/login/        # Public login page
│   ├── (app)/               # Authenticated app
│   │   ├── page.tsx         # Dashboard
│   │   ├── products/        # Product catalog
│   │   ├── inventory/       # Stock levels & movements
│   │   ├── purchasing/      # Purchase flow
│   │   ├── sales/           # Sales flow
│   │   ├── finance/         # Cash accounts & FX
│   │   ├── reports/         # Financial reports
│   │   ├── developer/       # Dev suite (role-gated)
│   │   └── settings/        # Master data settings
│   ├── layout.tsx           # Root layout (theme init)
│   ├── global-error.tsx     # Error boundary
│   └── not-found.tsx        # 404 page
├── components/
│   ├── brand/               # Logo, brand components
│   ├── layout/              # Sidebar, Topbar, ProfileMenu
│   └── ui/                  # Primitives (Button, Modal, Toast, etc.)
├── lib/
│   ├── api/                 # Typed API client modules
│   ├── export/              # PDF & Excel exporters
│   ├── format.ts            # Currency, date formatting
│   └── fuzzy.ts             # Fuzzy search helper
└── public/
    └── icon-stockkit.png    # Brand icon
```

---

## Routing Conventions

All authenticated pages live under `app/(app)/` (route group with shared layout).

| Route | Purpose |
|-------|---------|
| `/login` | Public login |
| `/` | Dashboard |
| `/products` | Product catalog (with images) |
| `/inventory` | Stock levels + movements + adjustments |
| `/purchasing` | Purchase requests |
| `/purchasing/orders` | Purchase orders |
| `/purchasing/receipts` | Goods receipts |
| `/purchasing/invoices` | Supplier invoices |
| `/sales` | Sales orders |
| `/sales/invoices` | Customer invoices |
| `/sales/receipts` | Customer receipts |
| `/finance/accounts` | Cash accounts |
| `/finance/fx` | FX rates |
| `/reports` | Financial reports with export |
| `/developer` | Developer suite (role-gated) |
| `/settings` | Settings hub |
| `/settings/categories` | Categories |
| `/settings/units` | Units |

---

## API Client Pattern

Each API module is a typed wrapper around `apiFetch`:

```ts
// lib/api/sales.ts
import { apiFetch } from "./client";

export type SalesOrder = { id: string; number: string; ... };

export async function listSalesOrders(): Promise<SalesOrder[]> {
  const body = await apiFetch<{ data: SalesOrder[] }>("/sales-orders");
  return body.data;
}

export async function createSalesOrder(payload: CreatePayload): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>("/sales-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}
```

### Auto-Refresh on 401

The client automatically refreshes access token on 401 and retries once:

```ts
async function apiFetch<T>(path, init): Promise<T> {
  let res = await fetch(`${API_BASE}${path}`, withCSRF(init));
  if (res.status === 401) {
    await refreshToken();
    res = await fetch(`${API_BASE}${path}`, withCSRF(init));
  }
  if (!res.ok) throw new ApiError(res);
  return res.json();
}
```

---

## Component Patterns

### Button

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  Save
</Button>

<Button variant="secondary" size="sm" disabled={loading}>
  {loading ? "Saving..." : "Save"}
</Button>

<Button variant="ghost" className="!text-danger">
  Delete
</Button>
```

### Modal

```tsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="Create Product"
  description="Add a new product to the catalog."
  icon={<ModalIcon path="M12 5v14M5 12h14" />}
>
  <form onSubmit={handleSubmit}>
    {/* fields */}
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button type="submit" disabled={submitting}>Save</Button>
    </div>
  </form>
</Modal>
```

### KpiCard

```tsx
<KpiCard label="Revenue" value={formatIDR(125000000)} sub="This month" />
```

### Toast

```tsx
const toast = useToast();

toast.success("Saved", "Product updated successfully.");
toast.error("Failed", err.message);
toast.warning("Low stock", "10 products below threshold.");
```

### DetailDrawer

```tsx
<DetailDrawer
  open={selected !== null}
  onClose={() => setSelected(null)}
  eyebrow="Product"
  title={selected?.name ?? ""}
>
  <DrawerSection label="Details">
    <DrawerFacts items={[
      ["SKU", selected.sku],
      ["Price", formatIDR(selected.price)],
    ]} />
  </DrawerSection>
</DetailDrawer>
```

---

## Theme System

Theme is controlled by a design-token system with 3 modes: `light`, `dark`, `system`.

```tsx
const { theme, setTheme } = useTheme();

<Button onClick={() => setTheme("dark")}>Dark</Button>
```

CSS variables defined in `globals.css`:
```css
:root {
  --color-bg: #FFFFFF;
  --color-fg: #12151A;
  --color-border: #E5E7EB;
  --color-accent: #2563EB;
  ...
}
.dark {
  --color-bg: #0B0D10;
  --color-fg: #F5F5F7;
  --color-border: #2A2E36;
  ...
}
```

---

## Charts (Recharts)

Standard pattern:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <BarChart data={data}>
    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
    <YAxis tick={{ fontSize: 10 }} />
    <Tooltip contentStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }} />
    <Bar dataKey="revenue" fill="#2563EB" radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

---

## Exporters

### PDF Reports

Uses `jsPDF` + `SignaturePad`:

```ts
import { buildFinancialReport } from "@/lib/export/pdf-report";

await buildFinancialReport(reportData, { name, signature });
```

### Excel Workbooks

Uses `exceljs`:

```ts
import { buildFinancialWorkbook } from "@/lib/export/excel-report";

await buildFinancialWorkbook(reportData);
```

---

## Developer Suite (role-gated)

Only accessible by users with `developer` role.

- **Metrics:** Goroutines, heap, DB pool, uptime
- **Analytics:** Bar chart (requests/hour), donut (status), top endpoints
- **Disk:** Log storage + OS disk gauge
- **Live logs:** Tail structured logs with filter

Sidebar item is automatically hidden for non-developers via `getDevMe()` check.

---

## Accessibility

- All interactive elements have `aria-label` or visible labels
- Focus rings via `focus-visible:ring-2 focus-visible:ring-accent/40`
- Keyboard navigation: `Ctrl+B` toggles sidebar, `Esc` closes modals
- `prefers-reduced-motion` fallback on all animations

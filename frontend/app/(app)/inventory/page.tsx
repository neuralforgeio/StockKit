"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  listMovements,
  listStockLevels,
  recordAdjustment,
  type Movement,
  type StockLevel,
} from "@/lib/api/inventory";
import { listProducts, type Product } from "@/lib/api/products";
import { listWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { formatIDR } from "@/lib/format";

type Tab = "stock" | "movements";

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("stock");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Inventory</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Stock levels, movement history, and manual adjustments.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-border">
        {(
          [
            ["stock", "Stock per warehouse"],
            ["movements", "Movements"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "border-accent text-accent"
                : "border-transparent text-fg-muted hover:text-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "stock" && <StockTab />}
      {tab === "movements" && <MovementsTab />}
    </div>
  );
}

function StockTab() {
  const toast = useToast();
  const [items, setItems] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listStockLevels());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      {error && (
        <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Record adjustment</Button>
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-md border border-border bg-bg" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No stock records yet"
          description="Record your first stock adjustment to start tracking inventory."
          action={
            <Button onClick={() => setOpen(true)}>Record adjustment</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Warehouse</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">On hand</th>
                <th className="px-4 py-2.5 text-right">Reserved</th>
                <th className="px-4 py-2.5 text-right">Available</th>
                <th className="px-4 py-2.5 text-right">Avg cost</th>
                <th className="px-4 py-2.5 text-right">Stock value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((s) => (
                <tr
                  key={`${s.warehouse_id}:${s.product_id}`}
                  className="hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-fg">
                    {s.warehouse_code}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg">
                    {s.product_sku}
                  </td>
                  <td className="px-4 py-2.5 text-fg">{s.product_name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {s.on_hand}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                    {s.reserved}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {s.available}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                    {formatIDR(s.avg_cost_minor)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(s.stock_value_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdjustmentModal
        open={open}
        onClose={() => setOpen(false)}
        onRecorded={(seq) => {
          load();
          toast.success(
            `Adjustment recorded`,
            `Movement seq ${seq} written to the immutable ledger.`,
          );
        }}
        onFailed={(message) => toast.error("Adjustment rejected", message)}
      />
    </>
  );
}

function MovementsTab() {
  const [items, setItems] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMovements({ limit: 25 });
      setItems(res.data);
      setNextCursor(res.next_cursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (nextCursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listMovements({ cursor: nextCursor, limit: 25 });
      setItems((prev) => [...prev, ...res.data]);
      setNextCursor(res.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-md border border-border bg-bg" />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No movements yet"
        description="Stock adjustments, receipts, and deliveries will appear here in order."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-border bg-bg">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2.5 w-20">Seq</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Warehouse</th>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5 text-right">Unit cost</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((m) => (
              <tr key={m.id} className="hover:bg-bg-subtle/50">
                <td className="px-4 py-2.5 tabular-nums text-fg-muted">
                  {m.movement_seq}
                </td>
                <td className="px-4 py-2.5 text-fg-muted">
                  {new Date(m.created_at).toLocaleString("id-ID", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.movement_type.includes("IN")
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {m.movement_type}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-fg">
                  {m.warehouse_code}
                </td>
                <td
                  className="max-w-[220px] truncate px-4 py-2.5 text-fg"
                  title={m.product_name}
                >
                  <span className="font-mono text-xs text-fg-muted">
                    {m.product_sku}
                  </span>
                  <span className="ml-2">{m.product_name}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {m.qty}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                  {formatIDR(m.unit_cost_minor)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {m.balance_after}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor !== null && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function AdjustmentModal({
  open,
  onClose,
  onRecorded,
  onFailed,
}: {
  open: boolean;
  onClose: () => void;
  onRecorded: (seq: number) => void;
  onFailed: (message: string) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [productId, setProductId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [movementType, setMovementType] = useState<"ADJ_IN" | "ADJ_OUT">(
    "ADJ_IN",
  );
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState(0);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([listProducts(undefined, 100), listWarehouses()]).then(
      ([p, w]) => {
        setProducts(p.data);
        setWarehouses(w);
        setProductId((prev) => prev || p.data[0]?.id || "");
        setWarehouseId((prev) => prev || w[0]?.id || "");
      },
    );
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const movement = await recordAdjustment({
        product_id: productId,
        warehouse_id: warehouseId,
        movement_type: movementType,
        qty: Math.max(1, Number(qty) || 1),
        unit_cost_minor: movementType === "ADJ_IN" ? unitCost : 0,
        reason: reason.trim(),
      });
      setQty("1");
      setUnitCost(0);
      setReason("");
      onClose();
      onRecorded(movement.movement_seq);
    } catch (err: any) {
      setError(err.message);
      onFailed(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record stock adjustment"
      description="Adjust on-hand quantity and update average cost for ADJ_IN."
      icon={<ModalIcon path="M12 5v14M5 12h14" />}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Product" required>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputClass()}
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Warehouse" required>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={inputClass()}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Direction" required>
            <select
              value={movementType}
              onChange={(e) => setMovementType(e.target.value as any)}
              className={inputClass()}
            >
              <option value="ADJ_IN">Increase (ADJ_IN)</option>
              <option value="ADJ_OUT">Decrease (ADJ_OUT)</option>
            </select>
          </Field>
          <Field label="Quantity" required>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputClass() + " tabular-nums"}
              required
            />
          </Field>
          {movementType === "ADJ_IN" && (
            <Field label="Unit cost">
              <CurrencyInput
                valueMinor={unitCost}
                onValueChange={setUnitCost}
                placeholder="9.500.000"
              />
            </Field>
          )}
          <Field label="Reason" required>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass()}
              placeholder="Initial stock count"
              required
            />
          </Field>
        </div>

        {selectedProduct && movementType === "ADJ_OUT" && (
          <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
            COGS uses the current average cost of this stock row.
          </div>
        )}

        {error && (
          <div className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording..." : "Record adjustment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function inputClass() {
  return "block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";
}

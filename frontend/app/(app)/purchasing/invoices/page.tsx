"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  DetailDrawer,
  DrawerFacts,
  DrawerSection,
} from "@/components/ui/detail-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  createSupplierInvoice,
  getNextInvoiceNumber,
  getSupplierInvoice,
  listSupplierInvoices,
  type SupplierInvoice,
} from "@/lib/api/invoices";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/api/purchasing";
import { listProducts, type Product } from "@/lib/api/products";
import { listSuppliers } from "@/lib/api/suppliers";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const statusTones: Record<string, string> = {
  open: "bg-bg-subtle text-fg-muted",
  matched: "bg-info/10 text-info",
  disputed: "bg-warning/10 text-warning",
  partial: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

type DraftLine = {
  key: string;
  product_id: string;
  po_line_id: string | null;
  qty: string;
  price: number;
};

export default function SupplierInvoicesPage() {
  const toast = useToast();
  const [items, setItems] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SupplierInvoice | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [supplierMap, setSupplierMap] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, sups] = await Promise.all([
        listSupplierInvoices(),
        listSuppliers(),
      ]);
      setItems(list);
      const map: Record<string, string> = {};
      sups.forEach((s) => {
        map[s.id] = s.name;
      });
      setSupplierMap(map);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const payable = items.filter(
      (i) => i.status !== "paid" && i.status !== "cancelled",
    );
    const openTotal = payable.reduce(
      (s, i) => s + (i.total_minor - i.paid_minor),
      0,
    );
    const matched = items.filter((i) => i.status === "matched").length;
    const disputed = items.filter((i) => i.status === "disputed").length;
    return {
      total: items.length,
      payable: payable.length,
      openTotal,
      matched,
      disputed,
    };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        fuzzyMatch(query, [
          i.number,
          i.supplier_code,
          supplierMap[i.supplier_id] ?? "",
        ]),
      ),
    [items, query, supplierMap],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total invoices"
          value={String(kpis.total)}
          sub={`${kpis.matched} matched · ${kpis.disputed} disputed`}
        />
        <KpiCard
          label="Payable invoices"
          value={String(kpis.payable)}
          sub="Open or partial"
        />
        <KpiCard
          label="Open balance"
          value={formatIDR(kpis.openTotal)}
          sub="Total less paid"
        />
        <KpiCard
          label="Disputed"
          value={String(kpis.disputed)}
          sub={kpis.disputed === 0 ? "No variance detected" : "Needs review"}
          icon={
            kpis.disputed === 0 ? (
              <span className="rounded-full bg-success/10 p-1 text-success">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            ) : (
              <span className="rounded-full bg-warning/10 p-1 text-warning">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
            )
          }
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Supplier invoices</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Record supplier invoices and review three-way match results.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoice or supplier"
          />
          <Button onClick={() => setOpenCreate(true)}>Record invoice</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No supplier invoices yet"
          description="Record the first invoice once stock has been received."
          action={
            <Button onClick={() => setOpenCreate(true)}>Record invoice</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Paid</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => {
                const disputed = inv.lines.filter(
                  (l) => l.match_status === "disputed",
                ).length;
                const matchCls =
                  disputed === 0
                    ? "bg-success/10 text-success"
                    : disputed === inv.lines.length
                      ? "bg-warning/10 text-warning"
                      : "bg-info/10 text-info";
                return (
                  <tr
                    key={inv.id}
                    onClick={() => setSelected(inv)}
                    className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-accent">
                      {inv.number}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs text-fg-muted">
                        {inv.supplier_code}
                      </span>
                      <span className="ml-2 text-fg">
                        {supplierMap[inv.supplier_id] ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {new Date(inv.invoice_date).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {formatIDR(inv.total_minor)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                      {formatIDR(inv.paid_minor)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[inv.status] ?? "bg-bg-subtle text-fg-muted"}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${matchCls}`}
                      >
                        {inv.lines.length - disputed}/{inv.lines.length} matched
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Supplier invoice"
        title={selected?.number ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Invoice details">
              <DrawerFacts
                items={[
                  ["Number", selected.number],
                  [
                    "Supplier",
                    `${selected.supplier_code} · ${supplierMap[selected.supplier_id] ?? "—"}`,
                  ],
                  [
                    "Invoice date",
                    new Date(selected.invoice_date).toLocaleDateString("id-ID"),
                  ],
                  [
                    "Due date",
                    selected.due_date
                      ? new Date(selected.due_date).toLocaleDateString("id-ID")
                      : "—",
                  ],
                  ["Total", formatIDR(selected.total_minor)],
                  ["Paid", formatIDR(selected.paid_minor)],
                  [
                    "Remaining",
                    formatIDR(selected.total_minor - selected.paid_minor),
                  ],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Three-way match">
              <div className="space-y-2">
                {selected.lines.map((l) => {
                  const ok = l.match_status === "matched";
                  return (
                    <div
                      key={l.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${ok ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-fg">{l.product_name}</p>
                          <p className="font-mono text-xs text-fg-subtle">
                            {l.product_sku}
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${ok ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
                        >
                          {l.match_status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-muted">
                        <span>
                          {l.qty_invoiced} × {formatIDR(l.unit_price_minor)}
                        </span>
                        <span className="tabular-nums text-fg">
                          {formatIDR(l.qty_invoiced * l.unit_price_minor)}
                        </span>
                      </div>
                      {l.match_note && (
                        <p className="mt-1.5 rounded-md bg-warning/10 px-2 py-1 text-[11px] leading-snug text-warning">
                          {l.match_note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </DrawerSection>
            {selected.note && (
              <DrawerSection label="Note">
                <p className="text-sm text-fg-muted">{selected.note}</p>
              </DrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>

      {openCreate && (
        <CreateInvoiceModal
          onClose={() => setOpenCreate(false)}
          onCreated={(inv) => {
            setOpenCreate(false);
            setSelected(inv);
            toast.success(
              `Recorded ${inv.number}`,
              "Three-way match evaluated automatically.",
            );
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateInvoiceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (inv: SupplierInvoice) => void;
}) {
  const toast = useToast();
  const [nextNumber, setNextNumber] = useState("—");
  const [suppliers, setSuppliers] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [poId, setPoId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getNextInvoiceNumber()
      .then(setNextNumber)
      .catch(() => setNextNumber("SINV-0001"));
    Promise.all([
      listSuppliers(),
      listProducts(undefined, 100),
      listPurchaseOrders(),
    ]).then(([sups, prods, poList]) => {
      setSuppliers(sups);
      setProducts(prods.data);
      setPos(poList);
      if (sups.length > 0) setSupplierId(sups[0].id);
    });
  }, []);

  const supplierPOs = useMemo(
    () =>
      pos.filter(
        (p) =>
          p.supplier_id === supplierId &&
          ["issued", "partially_received", "received"].includes(p.status),
      ),
    [pos, supplierId],
  );

  const importFromPO = (id: string) => {
    setPoId(id);
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    setLines(
      po.lines
        .filter((l) => l.received_qty > 0)
        .map((l) => ({
          key: l.id,
          product_id: l.product_id,
          po_line_id: l.id,
          qty: String(l.received_qty),
          price: l.unit_price_minor,
        })),
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: Math.random().toString(36),
        product_id: products[0]?.id ?? "",
        po_line_id: null,
        qty: "1",
        price: products[0]?.default_buy_price_minor ?? 0,
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
    );
  };

  const handleProductChange = (idx: number, productId: string) => {
    const p = products.find((x) => x.id === productId);
    updateLine(idx, {
      product_id: productId,
      po_line_id: null,
      price: p?.default_buy_price_minor ?? 0,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || lines.length === 0) {
      toast.error(
        "Validation failed",
        "Supplier and at least one line are required.",
      );
      return;
    }
    if (lines.some((l) => !l.product_id)) {
      toast.error(
        "Validation failed",
        "Every line must reference a catalog product.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const inv = await createSupplierInvoice({
        supplier_id: supplierId,
        purchase_order_id: poId || null,
        due_date: dueDate || null,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          purchase_order_line_id: l.po_line_id,
          product_id: l.product_id,
          qty_invoiced: Math.max(1, Number(l.qty) || 1),
          unit_price_minor: l.price,
        })),
      });
      onCreated(inv);
    } catch (err: any) {
      toast.error("Record failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record supplier invoice"
      icon={
        <ModalIcon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6" />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Invoice number" hint="Assigned by the system on save">
            <input
              value={nextNumber}
              readOnly
              className={inputClass("font-mono opacity-70")}
            />
          </Field>
          <Field label="Supplier" required>
            <select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value);
                setPoId("");
                setLines([]);
              }}
              className={inputClass()}
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Purchase order (optional)"
            hint="Imports received lines for three-way match"
          >
            <select
              value={poId}
              onChange={(e) => importFromPO(e.target.value)}
              className={inputClass()}
            >
              <option value="">— Manual lines —</option>
              {supplierPOs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number} · {p.status.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass()}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Note">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass()}
                placeholder="Optional"
              />
            </Field>
          </div>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">Lines</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addLine}
            >
              Add line
            </Button>
          </div>
          {lines.map((line, idx) => {
            const product = products.find((p) => p.id === line.product_id);
            return (
              <div
                key={line.key}
                className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-bg-subtle/40 p-3"
              >
                <div className="col-span-5">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Product
                  </label>
                  <select
                    value={line.product_id}
                    onChange={(e) => handleProductChange(idx, e.target.value)}
                    className={inputClass()}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                  {line.po_line_id && (
                    <p className="mt-1 text-[10px] font-medium text-info">
                      Linked to PO line · three-way match active
                    </p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Qty
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={line.qty}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                    className={inputClass("tabular-nums")}
                  />
                </div>
                <div className="col-span-4">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Unit price
                  </label>
                  <CurrencyInput
                    valueMinor={line.price}
                    onValueChange={(v) => updateLine(idx, { price: v })}
                    compare={false}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remove line"
                    className="rounded-md p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </button>
                </div>
                {product && (
                  <p className="col-span-12 -mt-1 text-[10px] text-fg-subtle">
                    Line total {formatIDR((Number(line.qty) || 0) * line.price)}
                  </p>
                )}
              </div>
            );
          })}
          {lines.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-fg-subtle">
              No lines yet — pick a purchase order to import received lines, or
              add manually.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Recording..." : "Record invoice"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

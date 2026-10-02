"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listCustomers } from "@/lib/api/customers";
import { listProducts, type Product } from "@/lib/api/products";
import {
  createCustomerInvoice,
  listCustomerInvoices,
  type CustomerInvoice,
} from "@/lib/api/sales";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const statusTones: Record<string, string> = {
  open: "bg-info/10 text-info",
  partial: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

type DraftLine = {
  key: string;
  product_id: string;
  qty: string;
  price: number;
};

export default function CustomerInvoicesPage() {
  const toast = useToast();
  const [items, setItems] = useState<CustomerInvoice[]>([]);
  const [customers, setCustomers] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    customer_id: "",
    due_date: "",
    note: "",
    lines: [] as DraftLine[],
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invs, custs, prods] = await Promise.all([
        listCustomerInvoices(),
        listCustomers(),
        listProducts(undefined, 100),
      ]);
      setItems(invs);
      setCustomers(custs.filter((c) => c.active));
      setProducts(prods.data);
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
    const receivable = items.filter(
      (i) => i.status !== "paid" && i.status !== "cancelled",
    );
    const openTotal = receivable.reduce(
      (s, i) => s + (i.total_minor - i.paid_minor),
      0,
    );
    const paid = items.filter((i) => i.status === "paid").length;
    return {
      total: items.length,
      receivable: receivable.length,
      openTotal,
      paid,
    };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((i) =>
        fuzzyMatch(query, [i.number, i.customer_name, i.customer_code]),
      ),
    [items, query],
  );

  const openCreate = () => {
    setDraft({
      customer_id: customers[0]?.id ?? "",
      due_date: "",
      note: "",
      lines: [
        {
          key: Math.random().toString(36),
          product_id: products[0]?.id ?? "",
          qty: "1",
          price: products[0]?.default_sell_price_minor ?? 0,
        },
      ],
    });
    setOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.customer_id || draft.lines.length === 0) {
      toast.error(
        "Validation failed",
        "Customer and at least one line are required.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const inv = await createCustomerInvoice({
        customer_id: draft.customer_id,
        due_date: draft.due_date || null,
        note: draft.note.trim() || undefined,
        lines: draft.lines.map((l) => ({
          product_id: l.product_id,
          qty_invoiced: Math.max(1, Number(l.qty) || 1),
          unit_price_minor: l.price,
        })),
      });
      setOpen(false);
      toast.success(`Recorded ${inv.number}`, "Customer exposure increased.");
      load();
    } catch (err: any) {
      toast.error("Record failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Customer invoices"
          value={String(kpis.total)}
          sub={`${kpis.paid} paid`}
        />
        <KpiCard
          label="Receivable"
          value={String(kpis.receivable)}
          sub="Open or partial"
        />
        <KpiCard
          label="Open balance"
          value={formatIDR(kpis.openTotal)}
          sub="Total less paid"
        />
        <KpiCard label="Paid" value={String(kpis.paid)} sub="Fully settled" />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Customer invoices</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Accounts receivable issued to customers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search invoice or customer"
          />
          <Button onClick={openCreate}>Record invoice</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No customer invoices yet"
          description="Record the first invoice to start accounts receivable."
          action={<Button onClick={openCreate}>Record invoice</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Invoice</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-right">Paid</th>
                <th className="px-4 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {inv.number}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-fg-muted">
                      {inv.customer_code}
                    </span>
                    <span className="ml-2 text-fg">{inv.customer_name}</span>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record customer invoice"
        icon={
          <ModalIcon path="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Customer" required>
              <select
                value={draft.customer_id}
                onChange={(e) =>
                  setDraft({ ...draft, customer_id: e.target.value })
                }
                className={inputClass()}
                required
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={draft.due_date}
                onChange={(e) =>
                  setDraft({ ...draft, due_date: e.target.value })
                }
                className={inputClass()}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Note">
                <input
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
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
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    lines: [
                      ...d.lines,
                      {
                        key: Math.random().toString(36),
                        product_id: products[0]?.id ?? "",
                        qty: "1",
                        price: products[0]?.default_sell_price_minor ?? 0,
                      },
                    ],
                  }))
                }
              >
                Add line
              </Button>
            </div>
            {draft.lines.map((line, idx) => (
              <div
                key={line.key}
                className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-bg-subtle/40 p-3"
              >
                <div className="col-span-6">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Product
                  </label>
                  <select
                    value={line.product_id}
                    onChange={(e) => {
                      const p = products.find((x) => x.id === e.target.value);
                      updateLine(idx, {
                        product_id: e.target.value,
                        price: p?.default_sell_price_minor ?? 0,
                      });
                    }}
                    className={inputClass()}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
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
                <div className="col-span-3">
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
                      setDraft((d) => ({
                        ...d,
                        lines: d.lines.filter((_, i) => i !== idx),
                      }))
                    }
                    disabled={draft.lines.length === 1}
                    aria-label="Remove line"
                    className="rounded-md p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger disabled:opacity-40"
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
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Recording..." : "Record invoice"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

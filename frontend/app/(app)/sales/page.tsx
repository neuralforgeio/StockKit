"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { listCustomers } from "@/lib/api/customers";
import { listFXRates, type FXRate } from "@/lib/api/fx";
import { listProducts, type Product } from "@/lib/api/products";
import {
  cancelSalesOrder,
  checkoutSalesOrder,
  createSalesOrder,
  deleteSalesOrder,
  deliverSalesOrder,
  listSalesOrders,
  submitSalesOrder,
  updateSalesOrder,
  type SalesOrder,
} from "@/lib/api/sales";
import {
  getApprovalByDocument,
  type ApprovalInstance,
} from "@/lib/api/approvals";
import { listWarehouses } from "@/lib/api/warehouses";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const statusTones: Record<string, string> = {
  draft: "bg-bg-subtle text-fg-muted",
  submitted: "bg-info/10 text-info",
  reserved: "bg-accent-subtle text-accent",
  delivered: "bg-success/10 text-success",
  invoiced: "bg-success/10 text-success",
  paid: "bg-success/10 text-success",
  cancelled: "bg-bg-subtle text-fg-subtle",
  rejected: "bg-danger/10 text-danger",
};
const approvalTones: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  none: "bg-bg-subtle text-fg-subtle",
};

type DraftLine = {
  key: string;
  product_id: string;
  qty: string;
  price: number;
};

export default function SalesPage() {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [items, setItems] = useState<SalesOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [warehouses, setWarehouses] = useState<
    { id: string; code: string; name: string }[]
  >([]);
  const [fxRates, setFxRates] = useState<FXRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalesOrder | null>(null);
  const [selected, setSelected] = useState<SalesOrder | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SalesOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approval, setApproval] = useState<ApprovalInstance | null>(null);
  const [draft, setDraft] = useState({
    customer_id: "",
    warehouse_id: "",
    note: "",
    currency: "IDR",
    lines: [] as DraftLine[],
  });
  const [submitting, setSubmitting] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Stable load: dep [] + toastRef => error tampil SEKALI, tidak loop.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sos, prods, custs, whs, fx] = await Promise.all([
        listSalesOrders(),
        listProducts(undefined, 100),
        listCustomers(),
        listWarehouses(),
        listFXRates(),
      ]);
      setItems(sos);
      setProducts(prods.data);
      setCustomers(custs.filter((c) => c.active));
      setWarehouses(whs.filter((w) => w.active));
      setFxRates(fx);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load");
      toastRef.current.error("Load failed", err?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const currencies = useMemo(() => {
    const s = new Set<string>(["IDR"]);
    for (const r of fxRates) {
      s.add(r.base_currency);
      s.add(r.quote_currency);
    }
    return [...s].sort();
  }, [fxRates]);

  const selectedRate = useMemo(
    () =>
      fxRates.find(
        (r) => r.base_currency === draft.currency && r.quote_currency === "IDR",
      ),
    [fxRates, draft.currency],
  );

  const kpis = useMemo(() => {
    const live = items.filter((s) => s.status !== "cancelled");
    return {
      total: live.length,
      drafts: live.filter((s) => s.status === "draft").length,
      active: live.filter((s) => !["paid", "rejected"].includes(s.status))
        .length,
      delivered: live.filter((s) =>
        ["delivered", "invoiced", "paid"].includes(s.status),
      ).length,
      cancelled: items.length - live.length,
      totalValue: live.reduce((s, so) => s + (so.total_minor ?? 0), 0),
    };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((so) =>
        fuzzyMatch(query, [
          so.number,
          so.customer_name,
          so.customer_code,
          so.status,
        ]),
      ),
    [items, query],
  );

  const newBlankLine = (): DraftLine => ({
    key: Math.random().toString(36),
    product_id: products[0]?.id ?? "",
    qty: "1",
    price: products[0]?.default_sell_price_minor ?? 0,
  });
  const openCreate = () => {
    setDraft({
      customer_id: customers[0]?.id ?? "",
      warehouse_id: warehouses[0]?.id ?? "",
      note: "",
      currency: "IDR",
      lines: [newBlankLine()],
    });
    setEditTarget(null);
    setOpen(true);
  };
  const openEdit = (so: SalesOrder) => {
    setEditTarget(so);
    setDraft({
      customer_id: so.customer_id,
      warehouse_id: so.warehouse_id,
      note: so.note ?? "",
      currency: so.currency ?? "IDR",
      lines: so.lines.map((l) => ({
        key: Math.random().toString(36),
        product_id: l.product_id,
        qty: String(l.quantity),
        price: l.unit_price_minor,
      })),
    });
    setOpen(true);
  };
  const updateLine = (i: number, p: Partial<DraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, j) => (j === i ? { ...l, ...p } : l)),
    }));
  const handleProductChange = (i: number, id: string) => {
    const p = products.find((x) => x.id === id);
    updateLine(i, { product_id: id, price: p?.default_sell_price_minor ?? 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.customer_id || !draft.warehouse_id || draft.lines.length === 0) {
      toastRef.current.error(
        "Validation failed",
        "Customer, warehouse, and at least one line are required.",
      );
      return;
    }
    setSubmitting(true);
    const lines = draft.lines.map((l) => ({
      product_id: l.product_id,
      quantity: Math.max(1, Number(l.qty) || 1),
      unit_price_minor: l.price,
    }));
    try {
      if (editTarget) {
        const u = await updateSalesOrder(editTarget.id, {
          customer_id: draft.customer_id,
          warehouse_id: draft.warehouse_id,
          note: draft.note.trim() || undefined,
          currency: draft.currency,
          lines,
        });
        setItems((p) => p.map((x) => (x.id === u.id ? u : x)));
        if (selected?.id === u.id) setSelected(u);
        setOpen(false);
        toastRef.current.success(`Updated ${u.number}`, "Changes saved.");
      } else {
        const so = await createSalesOrder({
          customer_id: draft.customer_id,
          warehouse_id: draft.warehouse_id,
          note: draft.note.trim() || undefined,
          currency: draft.currency,
          lines,
        });
        setOpen(false);
        setSelected(so);
        toastRef.current.success(`Created ${so.number}`, "Saved as draft.");
        load();
      }
    } catch (err: any) {
      toastRef.current.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openSelect = async (so: SalesOrder) => {
    setSelected(so);
    setApproval(await getApprovalByDocument("SO", so.id));
  };

  const handleAction = async (
    so: SalesOrder,
    action: "submit" | "checkout" | "deliver",
  ) => {
    if (actionInProgress === so.id) return; // prevent double-click
    setActionInProgress(so.id);
    try {
      let u: SalesOrder;
      let inst: ApprovalInstance | null = null;
      if (action === "submit") {
        u = await submitSalesOrder(so.id);
        inst = await getApprovalByDocument("SO", u.id);
        setApproval(inst);
      } else if (action === "checkout") {
        u = await checkoutSalesOrder(so.id);
        inst = approval;
      } else {
        u = await deliverSalesOrder(so.id);
        inst = approval;
      }
      // Optimistic update
      setItems((p) => p.map((x) => (x.id === so.id ? u : x)));
      setSelected(u);
      if (action === "submit")
        toast.success(
          `${u.number} submitted`,
          inst?.status === "pending" ? "Awaiting approval." : "Auto-approved.",
        );
      else if (action === "checkout")
        toast.success(`${u.number} reserved`, "Stock reserved.");
      else
        toast.success(
          `${u.number} delivered`,
          "Stock issued with COGS posted.",
        );
    } catch (err: any) {
      toast.error("Action failed", err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const u = await cancelSalesOrder(cancelTarget.id);
      setItems((p) => p.map((x) => (x.id === cancelTarget.id ? u : x)));
      if (selected?.id === cancelTarget.id) setSelected(u);
      setCancelTarget(null);
      toastRef.current.success(
        `Cancelled ${cancelTarget.number}`,
        "Cancelled.",
      );
    } catch (err: any) {
      toastRef.current.error("Cancel failed", err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSalesOrder(deleteTarget.id);
      setItems((p) => p.filter((x) => x.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
        setApproval(null);
      }
      setDeleteTarget(null);
      toastRef.current.success(`Deleted ${deleteTarget.number}`, "Removed.");
    } catch (err: any) {
      toastRef.current.error("Delete failed", err.message);
    } finally {
      setDeleting(false);
    }
  };

  const canCheckout =
    selected?.status === "submitted" && approval?.status !== "pending";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Sales orders"
          value={String(kpis.total)}
          sub={`${kpis.drafts} drafts · ${kpis.cancelled} cancelled`}
        />
        <KpiCard
          label="Active orders"
          value={String(kpis.active)}
          sub="In fulfillment pipeline"
        />
        <KpiCard
          label="Delivered"
          value={String(kpis.delivered)}
          sub="Completed orders"
        />
        <KpiCard
          label="Order value"
          value={formatIDR(kpis.totalValue)}
          sub="Excludes cancelled"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Sales</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Sales orders from quotation to delivery.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search order or customer"
          />
          <Button onClick={openCreate}>Create sales order</Button>
        </div>
      </header>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>
            Failed to load: {loadError}. Pastikan migration 000023 sudah
            ter-apply.
          </span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 && !loadError ? (
        <EmptyState
          title="No sales orders"
          description="Create the first sales order."
          action={<Button onClick={openCreate}>Create sales order</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Warehouse</th>
                <th className="px-4 py-2.5 text-right">Lines</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-48" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((so) => (
                <tr
                  key={so.id}
                  onClick={() => openSelect(so)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {so.number}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs text-fg-muted">
                      {so.customer_code}
                    </span>
                    <span className="ml-2 text-fg">{so.customer_name}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                    {so.warehouse_code}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {so.lines.length}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(so.total_minor ?? 0)}
                    {so.currency && so.currency !== "IDR" && (
                      <span className="ml-1 rounded bg-accent-subtle px-1 py-0.5 text-[10px] font-medium text-accent">
                        {so.currency}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[so.status] ?? "bg-bg-subtle text-fg-muted"}`}
                    >
                      {so.status}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end gap-1">
                      {so.status === "draft" && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openEdit(so)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(so, "submit")}
                            disabled={actionInProgress === so.id}
                          >
                            {actionInProgress === so.id
                              ? "Submitting..."
                              : "Submit"}
                          </Button>
                          <button
                            aria-label={`Delete ${so.number}`}
                            onClick={() => setDeleteTarget(so)}
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
                        </>
                      )}
                      {so.status === "submitted" && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="!text-danger hover:!bg-danger/10"
                            onClick={() => setCancelTarget(so)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(so, "checkout")}
                            disabled={
                              !canCheckout || actionInProgress === so.id
                            }
                          >
                            {actionInProgress === so.id
                              ? "Checking out..."
                              : approval?.status === "pending"
                                ? "Pending approval"
                                : "Checkout"}
                          </Button>
                        </>
                      )}
                      {so.status === "reserved" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAction(so, "deliver")}
                          disabled={actionInProgress === so.id}
                        >
                          {actionInProgress === so.id
                            ? "Delivering..."
                            : "Deliver"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => {
          setSelected(null);
          setApproval(null);
        }}
        eyebrow="Sales order"
        title={selected?.number ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Order details">
              <DrawerFacts
                items={[
                  [
                    "Customer",
                    `${selected.customer_code} · ${selected.customer_name}`,
                  ],
                  ["Warehouse", selected.warehouse_code],
                  ["Status", selected.status],
                  ["Currency", selected.currency ?? "IDR"],
                  ["Total", formatIDR(selected.total_minor ?? 0)],
                  [
                    "Created",
                    new Date(selected.created_at).toLocaleString("id-ID"),
                  ],
                ]}
              />
            </DrawerSection>
            {approval && (
              <DrawerSection label="Approval">
                <div className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {approval.status === "pending"
                        ? "Pending approval"
                        : approval.status === "approved"
                          ? "Approved"
                          : "Rejected"}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {approval.steps?.length ?? 0} step(s) ·{" "}
                      {approval.steps?.[0]?.approver_role ?? "-"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${approvalTones[approval.status] ?? ""}`}
                  >
                    {approval.status}
                  </span>
                </div>
                {approval.status === "pending" && (
                  <Link
                    href="/approvals"
                    className="mt-2 block text-xs font-medium text-accent hover:underline"
                  >
                    View in approvals inbox →
                  </Link>
                )}
              </DrawerSection>
            )}
            <DrawerSection label="Lines">
              <div className="space-y-2">
                {selected.lines.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-fg">{l.product_name}</p>
                      <p className="font-mono text-xs text-fg-subtle">
                        {l.product_sku}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums text-fg">
                        {l.quantity ?? 0} × {formatIDR(l.unit_price_minor ?? 0)}
                      </p>
                      <p className="tabular-nums text-xs text-fg-muted">
                        reserved {l.reserved_qty ?? 0} · delivered{" "}
                        {l.delivered_qty ?? 0}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </DrawerSection>
            {selected.note && (
              <DrawerSection label="Note">
                <p className="text-sm text-fg-muted">{selected.note}</p>
              </DrawerSection>
            )}
            <DrawerSection label="Pipeline">
              <div className="flex flex-wrap gap-2">
                {selected.status === "draft" && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(selected)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAction(selected, "submit")}
                      disabled={actionInProgress === selected.id}
                    >
                      {actionInProgress === selected.id
                        ? "Submitting..."
                        : "Submit"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="!text-danger hover:!bg-danger/10"
                      onClick={() => setDeleteTarget(selected)}
                    >
                      Delete
                    </Button>
                  </>
                )}
                {selected.status === "submitted" && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="!text-danger hover:!bg-danger/10"
                      onClick={() => setCancelTarget(selected)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAction(selected, "checkout")}
                      disabled={
                        !canCheckout || actionInProgress === selected.id
                      }
                    >
                      {actionInProgress === selected.id
                        ? "Checking out..."
                        : approval?.status === "pending"
                          ? "Pending approval"
                          : "Checkout"}
                    </Button>
                  </>
                )}
                {selected.status === "reserved" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAction(selected, "deliver")}
                    disabled={actionInProgress === selected.id}
                  >
                    {actionInProgress === selected.id
                      ? "Delivering..."
                      : "Deliver"}
                  </Button>
                )}
              </div>
            </DrawerSection>
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editTarget ? `Edit ${editTarget.number}` : "Create sales order"}
        icon={<ModalIcon path="M3 3v18h18M7 15l4-4 3 3 5-6" />}
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
            <Field label="Warehouse" required>
              <select
                value={draft.warehouse_id}
                onChange={(e) =>
                  setDraft({ ...draft, warehouse_id: e.target.value })
                }
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
            <Field label="Currency">
              <select
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value })
                }
                className={inputClass()}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {draft.currency !== "IDR" && selectedRate && (
                <p className="mt-1 text-[11px] text-fg-subtle">
                  1 {draft.currency} ≈{" "}
                  {formatIDR(Math.round(selectedRate.rate))}
                </p>
              )}
              {draft.currency !== "IDR" && !selectedRate && (
                <p className="mt-1 text-[11px] text-warning">
                  No FX rate for {draft.currency}/IDR.
                </p>
              )}
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
                    lines: [...d.lines, newBlankLine()],
                  }))
                }
              >
                Add line
              </Button>
            </div>
            {draft.lines.map((line, i) => (
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
                    onChange={(e) => handleProductChange(i, e.target.value)}
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
                    onChange={(e) => updateLine(i, { qty: e.target.value })}
                    className={inputClass("tabular-nums")}
                  />
                </div>
                <div className="col-span-3">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Unit price
                  </label>
                  <CurrencyInput
                    valueMinor={line.price}
                    onValueChange={(v) => updateLine(i, { price: v })}
                    compare={false}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        lines: d.lines.filter((_, j) => j !== i),
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
              {submitting
                ? "Saving..."
                : editTarget
                  ? "Save changes"
                  : "Save sales order"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title={`Cancel ${cancelTarget?.number}?`}
        description="The sales order will be marked as cancelled."
        confirmLabel="Cancel order"
        variant="danger"
        loading={cancelling}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.number}?`}
        description="Permanently removed. Cannot be undone."
        confirmLabel="Delete permanently"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton, IconPencil, IconTrash } from "@/components/ui/icon-button";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  cancelPurchaseRequest,
  convertPurchaseRequest,
  createPurchaseRequest,
  getPurchaseRequest,
  listPurchaseRequests,
  submitPurchaseRequest,
  updatePurchaseRequest,
  type PurchaseRequest,
} from "@/lib/api/purchasing";
import { listProducts, type Product } from "@/lib/api/products";
import { listSuppliers, type Supplier } from "@/lib/api/suppliers";
import { listWarehouses, type Warehouse } from "@/lib/api/warehouses";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

type DraftLine = {
  key: string;
  product_id: string;
  quantity: string;
  estimated_price_minor: number;
  note: string;
};

type Draft = { reason: string; cost_center: string; lines: DraftLine[] };

const emptyDraft: Draft = { reason: "", cost_center: "", lines: [] };

const statusTones: Record<string, string> = {
  draft: "bg-bg-subtle text-fg-muted",
  submitted: "bg-info/10 text-info",
  pending_approval: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  converted: "bg-accent-subtle text-accent",
  completed: "bg-success/10 text-success",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

export default function PurchasingPage() {
  const toast = useToast();
  const [items, setItems] = useState<PurchaseRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PurchaseRequest | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [submitting, setSubmitting] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<PurchaseRequest | null>(
    null,
  );
  const [cancelling, setCancelling] = useState(false);

  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prs, prods] = await Promise.all([
        listPurchaseRequests(),
        listProducts(undefined, 100),
      ]);
      setItems(prs);
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

  const filtered = useMemo(
    () =>
      items.filter((pr) =>
        fuzzyMatch(query, [pr.number, pr.reason, pr.cost_center ?? ""]),
      ),
    [items, query],
  );

  const openCreate = () => {
    setEditTarget(null);
    setDraft({
      ...emptyDraft,
      lines: [
        {
          key: Math.random().toString(36),
          product_id: products[0]?.id || "",
          quantity: "1",
          estimated_price_minor: 0,
          note: "",
        },
      ],
    });
    setOpen(true);
  };

  const openEdit = (pr: PurchaseRequest) => {
    setEditTarget(pr);
    setDraft({
      reason: pr.reason,
      cost_center: pr.cost_center ?? "",
      lines: pr.lines.map((l) => ({
        key: l.id,
        product_id: l.product_id,
        quantity: String(l.quantity),
        estimated_price_minor: l.estimated_price_minor,
        note: l.note ?? "",
      })),
    });
    setOpen(true);
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const removeLine = (idx: number) => {
    setDraft((d) => ({ ...d, lines: d.lines.filter((_, i) => i !== idx) }));
  };

  const addLine = () => {
    setDraft((d) => ({
      ...d,
      lines: [
        ...d.lines,
        {
          key: Math.random().toString(36),
          product_id: products[0]?.id || "",
          quantity: "1",
          estimated_price_minor: 0,
          note: "",
        },
      ],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.lines.length === 0) {
      toast.error("Validation failed", "Add at least one line item.");
      return;
    }
    setSubmitting(true);
    const payload = {
      reason: draft.reason.trim(),
      cost_center: draft.cost_center.trim() || null,
      lines: draft.lines.map((l) => ({
        product_id: l.product_id,
        quantity: Math.max(1, Number(l.quantity) || 1),
        estimated_price_minor: l.estimated_price_minor,
        note: l.note.trim() || null,
      })),
    };
    try {
      if (editTarget) {
        await updatePurchaseRequest(editTarget.id, payload);
        toast.success(
          `Updated ${editTarget.number}`,
          "Purchase request changes saved.",
        );
      } else {
        await createPurchaseRequest(payload);
        toast.success("Created PR", "Purchase request saved as draft.");
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitPR = async (pr: PurchaseRequest) => {
    try {
      const res = await submitPurchaseRequest(pr.id);
      if (res.data.status === "pending_approval") {
        toast.success(
          "Submitted for approval",
          `${pr.number} is waiting for approval.`,
        );
      } else {
        toast.success(
          "Auto-approved",
          `${pr.number} was auto-approved (below threshold).`,
        );
      }
      load();
    } catch (err: any) {
      toast.error("Submit failed", err.message);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelPurchaseRequest(cancelTarget.id);
      toast.success(
        `Cancelled ${cancelTarget.number}`,
        "The purchase request was cancelled.",
      );
      setCancelTarget(null);
      load();
    } catch (err: any) {
      toast.error("Cancel failed", err.message);
    } finally {
      setCancelling(false);
    }
  };

  const getTotal = (pr: PurchaseRequest) =>
    pr.lines.reduce((sum, l) => sum + l.quantity * l.estimated_price_minor, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Purchasing</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Purchase requests, approvals, and conversion to PO.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search number or reason"
          />
          <Button onClick={openCreate}>Create PR</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No purchase requests yet"
          description="Create the first request to start procurement."
          action={<Button onClick={openCreate}>Create PR</Button>}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5 text-right">Lines</th>
                <th className="px-4 py-2.5 text-right">Total Est.</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-44" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((pr) => (
                <tr
                  key={pr.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/purchasing/${pr.id}`}
                      className="font-mono text-xs text-accent hover:underline"
                    >
                      {pr.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {new Date(pr.created_at).toLocaleDateString("id-ID")}
                  </td>
                  <td
                    className="max-w-[220px] truncate px-4 py-2.5 text-fg"
                    title={pr.reason}
                  >
                    {pr.reason}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {pr.lines.length}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(getTotal(pr))}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[pr.status] ?? "bg-bg-subtle text-fg-muted"}`}
                    >
                      {pr.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {pr.status === "draft" && (
                        <>
                          <IconButton label="Edit" onClick={() => openEdit(pr)}>
                            <IconPencil />
                          </IconButton>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSubmitPR(pr)}
                          >
                            Submit
                          </Button>
                          <IconButton
                            label="Cancel"
                            variant="danger"
                            onClick={() => setCancelTarget(pr)}
                          >
                            <IconTrash />
                          </IconButton>
                        </>
                      )}
                      {pr.status === "approved" && (
                        <Button size="sm" onClick={() => setConvertTarget(pr)}>
                          Convert to PO
                        </Button>
                      )}
                      {pr.status === "submitted" && (
                        <IconButton
                          label="Cancel"
                          variant="danger"
                          onClick={() => setCancelTarget(pr)}
                        >
                          <IconTrash />
                        </IconButton>
                      )}
                    </div>
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
        title={
          editTarget ? `Edit ${editTarget.number}` : "Create purchase request"
        }
        icon={<ModalIcon path="M6 6h15l-1.5 9h-12L6 6zM6 6 5 3H2" />}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Reason" required>
            <input
              value={draft.reason}
              onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              className={inputClass()}
              placeholder="Office supplies for Q3"
              autoFocus
              required
            />
          </Field>
          <Field label="Cost center / project">
            <input
              value={draft.cost_center}
              onChange={(e) =>
                setDraft({ ...draft, cost_center: e.target.value })
              }
              className={inputClass()}
              placeholder="Marketing dept"
            />
          </Field>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">Line items</h3>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addLine}
              >
                Add line
              </Button>
            </div>
            {draft.lines.map((line, idx) => (
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
                    onChange={(e) =>
                      updateLine(idx, { product_id: e.target.value })
                    }
                    className={inputClass()}
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} - {p.name}
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
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(idx, { quantity: e.target.value })
                    }
                    className={inputClass("tabular-nums")}
                  />
                </div>
                <div className="col-span-4">
                  <label className="mb-1 block text-xs font-medium text-fg-muted">
                    Est. price
                  </label>
                  <CurrencyInput
                    valueMinor={line.estimated_price_minor}
                    onValueChange={(v) =>
                      updateLine(idx, { estimated_price_minor: v })
                    }
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <IconButton
                    label="Remove line"
                    variant="danger"
                    onClick={() => removeLine(idx)}
                    disabled={draft.lines.length === 1}
                  >
                    <IconTrash />
                  </IconButton>
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
              {submitting ? "Saving..." : "Save PR"}
            </Button>
          </div>
        </form>
      </Modal>

      {convertTarget && (
        <ConvertModal
          pr={convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={(poNumber) => {
            setConvertTarget(null);
            toast.success(
              `Created ${poNumber}`,
              "Purchase order issued. Track it under Purchase orders.",
            );
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancel}
        title={`Cancel ${cancelTarget?.number}?`}
        description="This purchase request will be cancelled and cannot be submitted."
        confirmLabel="Cancel PR"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}

function ConvertModal({
  pr,
  onClose,
  onConverted,
}: {
  pr: PurchaseRequest;
  onClose: () => void;
  onConverted: (poNumber: string) => void;
}) {
  const toast = useToast();
  const [full, setFull] = useState<PurchaseRequest | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<
    { lineId: string; qty: string; price: number }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      getPurchaseRequest(pr.id),
      listSuppliers(),
      listWarehouses(),
    ]).then(([detail, sups, whs]) => {
      setFull(detail);
      setSuppliers(sups);
      setWarehouses(whs);
      setSupplierId(sups[0]?.id ?? "");
      setWarehouseId(whs[0]?.id ?? "");
      setLines(
        detail.lines
          .filter((l) => l.converted_qty < l.quantity)
          .map((l) => ({
            lineId: l.id,
            qty: String(l.quantity - l.converted_qty),
            price: l.estimated_price_minor,
          })),
      );
    });
  }, [pr.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !warehouseId || lines.length === 0) {
      toast.error(
        "Validation failed",
        "Supplier, warehouse, and at least one line are required.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const po = await convertPurchaseRequest(pr.id, {
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        lines: lines.map((l) => ({
          purchase_request_line_id: l.lineId,
          quantity: Math.max(1, Number(l.qty) || 1),
          unit_price_minor: l.price,
        })),
      });
      onConverted(po.number);
    } catch (err: any) {
      toast.error("Convert failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Convert ${pr.number} to PO`}
      icon={
        <ModalIcon path="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Supplier" required>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={inputClass()}
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination warehouse" required>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={inputClass()}
              required
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} - {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-fg">Remaining lines</h3>
          {lines.length === 0 && (
            <p className="text-sm text-fg-muted">
              All lines are already converted.
            </p>
          )}
          {full?.lines
            .filter((l) => l.converted_qty < l.quantity)
            .map((l) => {
              const line = lines.find((x) => x.lineId === l.id);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-bg-subtle/40 p-3"
                >
                  <div className="col-span-6">
                    <p className="text-sm text-fg">{l.product_name}</p>
                    <p className="font-mono text-xs text-fg-subtle">
                      {l.product_sku} · remaining {l.quantity - l.converted_qty}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Qty
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={l.quantity - l.converted_qty}
                      value={line?.qty ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.lineId === l.id
                              ? { ...x, qty: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className={inputClass("tabular-nums")}
                    />
                  </div>
                  <div className="col-span-4">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Unit price
                    </label>
                    <CurrencyInput
                      valueMinor={line?.price ?? 0}
                      onValueChange={(v) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.lineId === l.id ? { ...x, price: v } : x,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
              );
            })}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Converting..." : "Issue PO"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

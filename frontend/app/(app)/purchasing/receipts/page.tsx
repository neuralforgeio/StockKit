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
  listGoodsReceipts,
  listPurchaseOrders,
  recordGoodsReceipt,
  type GoodsReceipt,
  type PurchaseOrder,
} from "@/lib/api/purchasing";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

export default function GoodsReceiptsPage() {
  const toast = useToast();
  const [items, setItems] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GoodsReceipt | null>(null);
  const [openRecord, setOpenRecord] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listGoodsReceipts());
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
    const totalValue = items.reduce((s, gr) => s + gr.total_value_minor, 0);
    const count = items.length;
    const totalLines = items.reduce((s, gr) => s + (gr.lines ?? []).length, 0);
    const totalUnits = items.reduce(
      (s, gr) => s + (gr.lines ?? []).reduce((a, l) => a + l.qty_received, 0),
      0,
    );
    return { totalValue, count, totalLines, totalUnits };
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((gr) =>
        fuzzyMatch(query, [
          gr.number,
          gr.purchase_order_number,
          gr.warehouse_code,
        ]),
      ),
    [items, query],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total Received Value"
          value={formatIDR(kpis.totalValue)}
          sub="All goods receipts"
        />
        <KpiCard
          label="Goods Receipts"
          value={String(kpis.count)}
          sub={`${kpis.totalLines} lines recorded`}
        />
        <KpiCard
          label="Units Received"
          value={kpis.totalUnits.toLocaleString("id-ID")}
          sub="Cumulative inbound"
        />
        <KpiCard
          label="Avg Lines per GR"
          value={
            kpis.count > 0 ? (kpis.totalLines / kpis.count).toFixed(1) : "0"
          }
          sub="Average receipt size"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Goods receipts</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Record stock received against purchase orders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search GR or PO number"
          />
          <Button onClick={() => setOpenRecord(true)}>Record receipt</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No goods receipts yet"
          description="Record the first receipt when stock arrives from a purchase order."
          action={
            <Button onClick={() => setOpenRecord(true)}>Record receipt</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">GR Number</th>
                <th className="px-4 py-2.5">PO Number</th>
                <th className="px-4 py-2.5">Warehouse</th>
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5 text-right">Lines</th>
                <th className="px-4 py-2.5 text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((gr) => (
                <tr
                  key={gr.id}
                  onClick={() => setSelected(gr)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">
                    {gr.number}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                    {gr.purchase_order_number}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                    {gr.warehouse_code}
                  </td>
                  <td className="px-4 py-2.5 text-fg-muted">
                    {new Date(gr.received_at).toLocaleDateString("id-ID")}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {(gr.lines ?? []).length}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(gr.total_value_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Goods receipt"
        title={selected?.number ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Receipt details">
              <DrawerFacts
                items={[
                  ["GR number", selected.number],
                  ["PO number", selected.purchase_order_number],
                  ["Warehouse", selected.warehouse_code],
                  [
                    "Received",
                    new Date(selected.received_at).toLocaleString("id-ID"),
                  ],
                  ["Total value", formatIDR(selected.total_value_minor)],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Lines received">
              <div className="space-y-2">
                {(selected.lines ?? []).map((l) => (
                  <div
                    key={l.id}
                    className="rounded-lg border border-border bg-bg-subtle/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-fg">
                          {l.product_name}
                        </p>
                        <p className="font-mono text-xs text-fg-subtle">
                          {l.product_sku}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-fg">
                          {l.qty_received} units
                        </p>
                        <p className="text-xs tabular-nums text-fg-muted">
                          {formatIDR(l.unit_cost_minor)} / unit
                        </p>
                      </div>
                    </div>
                    {l.discrepancy_note && (
                      <p className="mt-2 rounded-md bg-warning/10 px-2 py-1 text-xs text-warning">
                        Variance note: {l.discrepancy_note}
                      </p>
                    )}
                  </div>
                ))}
                {(selected.lines ?? []).length === 0 && (
                  <p className="text-sm text-fg-muted">No lines recorded.</p>
                )}
              </div>
            </DrawerSection>
            {selected.note && (
              <DrawerSection label="Receipt note">
                <p className="text-sm text-fg-muted">{selected.note}</p>
              </DrawerSection>
            )}
          </div>
        )}
      </DetailDrawer>

      {openRecord && (
        <RecordReceiptModal
          onClose={() => setOpenRecord(false)}
          onRecorded={(grNumber) => {
            setOpenRecord(false);
            toast.success(
              `Created ${grNumber}`,
              "Goods receipt recorded. Stock and cost updated.",
            );
            load();
          }}
        />
      )}
    </div>
  );
}

function RecordReceiptModal({
  onClose,
  onRecorded,
}: {
  onClose: () => void;
  onRecorded: (grNumber: string) => void;
}) {
  const toast = useToast();
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<
    { lineId: string; qty: string; cost: number; note: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listPurchaseOrders().then((list) => {
      const receivable = list.filter(
        (po) => po.status === "issued" || po.status === "partially_received",
      );
      setPos(receivable);
      if (receivable.length > 0) {
        setSelectedPO(receivable[0]);
        setLines(
          (receivable[0].lines ?? [])
            .filter((l) => l.received_qty < l.allowed_qty)
            .map((l) => ({
              lineId: l.id,
              qty: String(l.allowed_qty - l.received_qty),
              cost: l.unit_price_minor,
              note: "",
            })),
        );
      }
    });
  }, []);

  const handlePOChange = (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;
    setSelectedPO(po);
    setLines(
      (po.lines ?? [])
        .filter((l) => l.received_qty < l.allowed_qty)
        .map((l) => ({
          lineId: l.id,
          qty: String(l.allowed_qty - l.received_qty),
          cost: l.unit_price_minor,
          note: "",
        })),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || lines.length === 0) {
      toast.error(
        "Validation failed",
        "Select a PO with at least one open line.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const gr = await recordGoodsReceipt({
        purchase_order_id: selectedPO.id,
        warehouse_id: selectedPO.warehouse_id,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          purchase_order_line_id: l.lineId,
          qty_received: Math.max(1, Number(l.qty) || 1),
          unit_cost_minor: l.cost,
          discrepancy_note: l.note.trim() || undefined,
        })),
      });
      onRecorded(gr.number);
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
      title="Record goods receipt"
      icon={
        <ModalIcon path="M20 7l-8-4-8 4v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10" />
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Purchase order" required>
          <select
            value={selectedPO?.id ?? ""}
            onChange={(e) => handlePOChange(e.target.value)}
            className={inputClass()}
            required
          >
            {pos.map((po) => (
              <option key={po.id} value={po.id}>
                {po.number} · {po.supplier_code} · {po.status.replace("_", " ")}
              </option>
            ))}
            {pos.length === 0 && (
              <option value="">No receivable purchase orders</option>
            )}
          </select>
        </Field>
        <Field label="Receipt note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputClass()}
            placeholder="Optional note about this receipt"
          />
        </Field>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-fg">Lines to receive</h3>
          {lines.length === 0 && (
            <p className="text-sm text-fg-muted">
              All lines of this PO are fully received.
            </p>
          )}
          {(selectedPO?.lines ?? [])
            .filter((l) => l.received_qty < l.allowed_qty)
            .map((l) => {
              const line = lines.find((x) => x.lineId === l.id);
              const remaining = l.allowed_qty - l.received_qty;
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border bg-bg-subtle/40 p-3"
                >
                  <div className="col-span-5">
                    <p className="truncate text-sm text-fg">{l.product_name}</p>
                    <p className="font-mono text-xs text-fg-subtle">
                      {l.product_sku} · remaining {remaining}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Qty
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={remaining}
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
                  <div className="col-span-3">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Unit cost
                    </label>
                    <CurrencyInput
                      valueMinor={line?.cost ?? 0}
                      onValueChange={(v) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.lineId === l.id ? { ...x, cost: v } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs font-medium text-fg-muted">
                      Variance
                    </label>
                    <input
                      value={line?.note ?? ""}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.lineId === l.id
                              ? { ...x, note: e.target.value }
                              : x,
                          ),
                        )
                      }
                      className={inputClass()}
                      placeholder="Note"
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
            {submitting ? "Recording..." : "Record receipt"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { listPurchaseOrders, type PurchaseOrder } from "@/lib/api/purchasing";
import { formatIDR } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

const statusTones: Record<string, string> = {
  draft: "bg-bg-subtle text-fg-muted",
  issued: "bg-info/10 text-info",
  partially_received: "bg-warning/10 text-warning",
  received: "bg-success/10 text-success",
  closed: "bg-success/10 text-success",
  closed_short: "bg-warning/10 text-warning",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

export default function PurchaseOrdersPage() {
  const toast = useToast();
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listPurchaseOrders());
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Purchase orders</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Issued POs converted from approved purchase requests.
        </p>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Convert an approved purchase request to issue the first PO."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Number</th>
                <th className="px-4 py-2.5">Supplier</th>
                <th className="px-4 py-2.5">Warehouse</th>
                <th className="px-4 py-2.5 text-right">Received</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5">Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((po) => {
                const lines = po.lines ?? [];
                const receivedLines = lines.filter(
                  (l) => l.received_qty >= l.qty_ordered,
                ).length;
                return (
                  <tr
                    key={po.id}
                    className="transition-colors hover:bg-bg-subtle/50"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-accent">
                      {po.number}
                    </td>
                    <td className="px-4 py-2.5 text-fg">
                      <span className="font-mono text-xs text-fg-muted">
                        {po.supplier_code}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                      {po.warehouse_code}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                      {receivedLines}/{lines.length} lines
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {formatIDR(po.total_minor)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[po.status] ?? "bg-bg-subtle text-fg-muted"}`}
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {po.issued_at
                        ? new Date(po.issued_at).toLocaleDateString("id-ID")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

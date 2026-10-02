"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { getPurchaseRequest, type PurchaseRequest } from "@/lib/api/purchasing";
import {
  getApprovalByDocument,
  type ApprovalInstance,
} from "@/lib/api/approvals";
import { formatIDR } from "@/lib/format";

export default function PurchaseRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const [pr, setPr] = useState<PurchaseRequest | null>(null);
  const [approval, setApproval] = useState<ApprovalInstance | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prData, approvalData] = await Promise.all([
        getPurchaseRequest(id),
        getApprovalByDocument("PR", id),
      ]);
      setPr(prData);
      setApproval(approvalData);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
    );
  if (!pr)
    return (
      <EmptyState
        title="PR not found"
        description="The purchase request does not exist."
        action={
          <Link href="/purchasing">
            <Button>Back to Purchasing</Button>
          </Link>
        }
      />
    );

  const total = pr.lines.reduce(
    (sum, l) => sum + l.quantity * l.estimated_price_minor,
    0,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/purchasing"
        className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Purchasing
      </Link>

      <section className="card-surface overflow-hidden rounded-xl border border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {pr.number}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">{pr.reason}</p>
          </div>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
              pr.status === "approved"
                ? "bg-success/10 text-success"
                : pr.status === "rejected"
                  ? "bg-danger/10 text-danger"
                  : pr.status === "pending_approval"
                    ? "bg-warning/10 text-warning"
                    : "bg-bg-subtle text-fg-muted"
            }`}
          >
            {pr.status.replace("_", " ")}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Cost Center
            </p>
            <p className="mt-0.5 text-sm font-semibold text-fg">
              {pr.cost_center || "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Created
            </p>
            <p className="mt-0.5 text-sm font-semibold text-fg">
              {new Date(pr.created_at).toLocaleDateString("id-ID")}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Lines
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
              {pr.lines.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
              Total Est.
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-fg">
              {formatIDR(total)}
            </p>
          </div>
        </div>
      </section>

      <section className="card-surface overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-bg-subtle/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-5 py-2.5">Product</th>
                <th className="px-5 py-2.5 text-right">Qty</th>
                <th className="px-5 py-2.5 text-right">Est. Price</th>
                <th className="px-5 py-2.5 text-right">Subtotal</th>
                <th className="px-5 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pr.lines.map((l) => (
                <tr
                  key={l.id}
                  className="transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-fg">{l.product_name}</p>
                    <p className="font-mono text-xs text-fg-muted">
                      {l.product_sku}
                    </p>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                    {l.quantity}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                    {formatIDR(l.estimated_price_minor)}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                    {formatIDR(l.quantity * l.estimated_price_minor)}
                  </td>
                  <td className="px-5 py-2.5 text-fg-muted">{l.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-surface overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-bg-subtle/60 px-5 py-3">
          <h2 className="text-sm font-semibold text-fg">Approval Timeline</h2>
        </div>
        <div className="p-5">
          {!approval ? (
            <p className="text-sm text-fg-muted">
              No approval required or auto-approved (below threshold).
            </p>
          ) : (
            <div className="space-y-3">
              {approval.steps.map((step) => (
                <div
                  key={step.id}
                  className="flex gap-3 rounded-lg border border-border bg-bg p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-xs font-semibold text-fg-muted">
                    {step.level}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-fg">
                        Level {step.level} ({step.approver_role})
                      </p>
                      {step.decision && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${step.decision === "approve" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                        >
                          {step.decision === "approve"
                            ? "Approved"
                            : "Rejected"}
                        </span>
                      )}
                    </div>
                    {step.reason && (
                      <p className="mt-1 text-xs text-fg-muted">
                        "{step.reason}"
                      </p>
                    )}
                    {step.decided_at && (
                      <p className="mt-1 text-xs text-fg-subtle">
                        Decided on{" "}
                        {new Date(step.decided_at).toLocaleString("id-ID")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

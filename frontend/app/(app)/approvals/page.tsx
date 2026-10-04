"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  DetailDrawer,
  DrawerFacts,
  DrawerSection,
} from "@/components/ui/detail-drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import {
  getApproval,
  listApprovals,
  decideApproval,
  type ApprovalInstance,
} from "@/lib/api/approvals";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const statusTones: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
  cancelled: "bg-bg-subtle text-fg-subtle",
};

const DOC_LABELS: Record<string, string> = {
  PR: "Purchase Request",
  PO: "Purchase Order",
  SO: "Sales Order",
  ADJ: "Inventory Adjustment",
  REFUND: "Refund",
};

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums text-fg">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-fg-subtle">{sub}</p>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-64 rounded-lg border border-border bg-bg py-1.5 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}

export default function ApprovalsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ApprovalInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ApprovalInstance | null>(null);
  const [decideOpen, setDecideOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected">("approved");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decideAmount, setDecideAmount] = useState(0);
  const [pendingDecisions, setPendingDecisions] = useState<Set<string>>(
    new Set(),
  );

  // Stabilize toast via ref to avoid useEffect re-fire
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = await listApprovals();
      setItems(Array.isArray(list) ? list : []);
    } catch (err: any) {
      // Do NOT retry on error; only show toast once.
      if (!silent) toastRef.current.error("Load failed", err.message);
    } finally {
      if (!silent) setLoading(false);
    }
    // No dependencies — toastRef holds stable reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Run once on mount; do NOT re-run when toast changes.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = useMemo(
    () => items.filter((i) => i.status === "pending"),
    [items],
  );

  const filtered = useMemo(
    () =>
      pending.filter((i) =>
        fuzzyMatch(query, [
          i.document_label ?? "",
          i.document_type ?? "",
          i.requester_name ?? "",
        ]),
      ),
    [pending, query],
  );

  const kpis = useMemo(() => {
    const pendingCount = pending.length;
    const approvedCount = items.filter((i) => i.status === "approved").length;
    const rejectedCount = items.filter((i) => i.status === "rejected").length;
    return { pendingCount, approvedCount, rejectedCount, total: items.length };
  }, [items, pending]);

  const openSelect = async (id: string) => {
    try {
      const inst = await getApproval(id);
      setSelected(inst);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    }
  };

  const openDecide = (inst: ApprovalInstance) => {
    setSelected(inst);
    setDecision("approved");
    setReason("");
    setDecideAmount(inst.amount_minor ?? 0);
    setDecideOpen(true);
  };

  const handleDecide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const instanceId = selected.id;
    if (pendingDecisions.has(instanceId)) return; // prevent double-click

    setSubmitting(true);
    setPendingDecisions((prev) => new Set(prev).add(instanceId));
    try {
      const updated = await decideApproval(instanceId, decision, reason.trim());
      // Optimistic update: mark as settled immediately before reload
      setItems((prev) => prev.map((i) => (i.id === instanceId ? updated : i)));
      if (selected.id === instanceId) {
        setSelected(updated);
      }
      toast.success(
        decision === "approved" ? "Approved" : "Rejected",
        decision === "approved"
          ? "The document can now proceed to the next stage."
          : "The requester has been notified of your decision.",
      );
      setDecideOpen(false);
      load(true); // silent reload to refresh list
    } catch (err: any) {
      toast.error("Decision failed", err.message);
    } finally {
      setSubmitting(false);
      setPendingDecisions((prev) => {
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Pending"
          value={String(kpis.pendingCount)}
          sub="Awaiting your decision"
        />
        <KpiCard
          label="Approved"
          value={String(kpis.approvedCount)}
          sub="This period"
        />
        <KpiCard
          label="Rejected"
          value={String(kpis.rejectedCount)}
          sub="This period"
        />
        <KpiCard
          label="Total instances"
          value={String(kpis.total)}
          sub="All decisions tracked"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Approvals</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Documents waiting for your decision.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search label, type, or requester"
          />
          <Link href="/settings/approvals">
            <Button variant="secondary">Manage rules</Button>
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={pending.length === 0 ? "Inbox zero" : "No matches"}
          description={
            pending.length === 0
              ? "You have no pending approvals right now. New requests will appear here."
              : "Try a different search term."
          }
          action={
            <Link href="/settings/approvals">
              <Button variant="secondary">Manage approval rules</Button>
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Document</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Requester</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5 text-center">Step</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((inst) => {
                const currentStep = inst.steps?.find(
                  (s) => s.status === "pending",
                );
                const stepNo = currentStep?.level ?? inst.steps?.length ?? 0;
                const amount = inst.amount_minor ?? 0;
                return (
                  <tr
                    key={inst.id}
                    onClick={() => openSelect(inst.id)}
                    className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                  >
                    <td className="px-4 py-2.5 text-fg">
                      {inst.document_label ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent">
                        {DOC_LABELS[inst.document_type] ?? inst.document_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">
                      {inst.requester_name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {amount > 0 ? formatIDR(amount) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-fg">
                      {stepNo}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTones[inst.status] ?? "bg-bg-subtle text-fg-muted"}`}
                      >
                        {inst.status}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openDecide(inst)}
                          disabled={
                            pendingDecisions.has(inst.id) ||
                            inst.status !== "pending"
                          }
                        >
                          {pendingDecisions.has(inst.id)
                            ? "Processing..."
                            : "Decide"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DetailDrawer
        open={selected !== null && !decideOpen}
        onClose={() => setSelected(null)}
        eyebrow="Approval instance"
        title={selected?.document_label ?? ""}
      >
        {selected && (
          <div className="space-y-5">
            <DrawerSection label="Overview">
              <DrawerFacts
                items={[
                  ["Document", selected.document_label ?? "—"],
                  [
                    "Type",
                    DOC_LABELS[selected.document_type] ??
                      selected.document_type ??
                      "—",
                  ],
                  ["Requester", selected.requester_name ?? "—"],
                  [
                    "Amount",
                    (selected.amount_minor ?? 0) > 0
                      ? formatIDR(selected.amount_minor ?? 0)
                      : "—",
                  ],
                  ["Status", selected.status],
                  [
                    "Submitted",
                    new Date(selected.created_at).toLocaleString("id-ID"),
                  ],
                ]}
              />
            </DrawerSection>

            <DrawerSection label="Approval steps">
              <ol className="space-y-2">
                {(selected.steps ?? []).map((s) => {
                  const tone =
                    s.status === "approved"
                      ? "border-success/40 bg-success/5"
                      : s.status === "rejected"
                        ? "border-danger/40 bg-danger/5"
                        : "border-warning/40 bg-warning/5";
                  return (
                    <li
                      key={s.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${tone}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize text-fg">
                          Level {s.level} · {s.approver_role}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTones[s.status] ?? ""}`}
                        >
                          {s.status}
                        </span>
                      </div>
                      {s.decider_name && (
                        <p className="mt-1 text-xs text-fg-muted">
                          Decided by {s.decider_name} ·{" "}
                          {s.decided_at
                            ? new Date(s.decided_at).toLocaleString("id-ID")
                            : "—"}
                        </p>
                      )}
                      {s.reason && (
                        <p className="mt-1.5 rounded-md bg-bg-subtle px-2 py-1 text-[11px] leading-snug text-fg-muted">
                          {s.reason}
                        </p>
                      )}
                    </li>
                  );
                })}
                {(selected.steps ?? []).length === 0 && (
                  <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-fg-subtle">
                    No steps defined.
                  </li>
                )}
              </ol>
            </DrawerSection>

            {selected.status === "pending" && (
              <div className="flex justify-end">
                <Button
                  onClick={() => openDecide(selected)}
                  disabled={pendingDecisions.has(selected.id)}
                >
                  {pendingDecisions.has(selected.id)
                    ? "Processing..."
                    : "Decide now"}
                </Button>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={decideOpen}
        onClose={() => setDecideOpen(false)}
        title={selected ? `Decide: ${selected.document_label}` : "Decide"}
        description="Your decision advances the document to the next step or returns it to the requester."
        icon={
          <ModalIcon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        }
      >
        <form onSubmit={handleDecide} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Decision" required>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDecision("approved")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      decision === "approved"
                        ? "border-success bg-success/10 text-success"
                        : "border-border text-fg-muted hover:bg-bg-subtle"
                    }`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision("rejected")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      decision === "rejected"
                        ? "border-danger bg-danger/10 text-danger"
                        : "border-border text-fg-muted hover:bg-bg-subtle"
                    }`}
                  >
                    Reject
                  </button>
                </div>
              </Field>
            </div>
            <Field label="Amount under review">
              <CurrencyInput
                valueMinor={decideAmount}
                onValueChange={setDecideAmount}
                disabled
                compare={false}
              />
            </Field>
            <div className="md:col-span-2">
              <Field
                label="Reason"
                hint={
                  decision === "rejected"
                    ? "Required when rejecting"
                    : "Optional"
                }
              >
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required={decision === "rejected"}
                  rows={3}
                  placeholder="Add context for the requester..."
                  className={`${inputClass()} resize-none`}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDecideOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className={
                decision === "rejected"
                  ? "!bg-danger hover:!bg-danger/90"
                  : "!bg-success hover:!bg-success/90"
              }
            >
              {submitting
                ? "Recording..."
                : decision === "approved"
                  ? "Approve"
                  : "Reject"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

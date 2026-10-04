"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  listAuditLogs,
  type AuditFilter,
  type AuditLog,
} from "@/lib/api/audit";

const EVENT_BADGE: Record<string, string> = {
  INSERT: "bg-success/15 text-success",
  UPDATE: "bg-warning/15 text-warning",
  DELETE: "bg-danger/15 text-danger",
};

const ENTITY_BADGE: Record<string, string> = {
  sales_orders: "bg-blue-500/15 text-blue-400",
  purchase_requests: "bg-purple-500/15 text-purple-400",
  approval_instances: "bg-amber-500/15 text-amber-400",
  customer_invoices: "bg-emerald-500/15 text-emerald-400",
  supplier_invoices: "bg-rose-500/15 text-rose-400",
  customers: "bg-cyan-500/15 text-cyan-400",
  suppliers: "bg-pink-500/15 text-pink-400",
  products: "bg-indigo-500/15 text-indigo-400",
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function diffJson(
  oldData: any,
  newData: any,
): { key: string; old: any; new: any }[] {
  if (!oldData && !newData) return [];
  const all = new Set<string>();
  if (oldData) Object.keys(oldData).forEach((k) => all.add(k));
  if (newData) Object.keys(newData).forEach((k) => all.add(k));
  const out: { key: string; old: any; new: any }[] = [];
  for (const k of all) {
    const o = oldData?.[k];
    const n = newData?.[k];
    if (JSON.stringify(o) !== JSON.stringify(n))
      out.push({ key: k, old: o, new: n });
  }
  return out;
}

export default function AuditPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [filter, setFilter] = useState<AuditFilter>({
    entity_type: "",
    event_type: "",
    from: "",
    to: "",
    limit: 100,
    offset: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs(filter);
      setLogs(res.data);
      setTotal(res.total);
    } catch (err: any) {
      toast.error("Load failed", err?.message ?? "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (patch: Partial<AuditFilter>) =>
    setFilter((f) => ({ ...f, ...patch, offset: 0 }));
  const page = (offset: number) => setFilter((f) => ({ ...f, offset }));

  const limit = filter.limit ?? 100;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Audit logs</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Immutable event trail for critical entities. Developer/auditor only.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams({ format: "xlsx" });
              if (filter.from) params.set("from", filter.from);
              if (filter.to) params.set("to", filter.to);
              window.open(
                `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"}/audit-logs/export?${params.toString()}`,
                "_blank",
              );
            }}
          >
            Export Excel
          </Button>
        </div>
      </header>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg p-3">
        <select
          value={filter.entity_type ?? ""}
          onChange={(e) => update({ entity_type: e.target.value })}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg"
        >
          <option value="">All entities</option>
          {Object.keys(ENTITY_BADGE).map((k) => (
            <option key={k} value={k}>
              {k.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={filter.event_type ?? ""}
          onChange={(e) => update({ event_type: e.target.value })}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg"
        >
          <option value="">All events</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input
          type="date"
          value={filter.from ?? ""}
          onChange={(e) => update({ from: e.target.value })}
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
        />
        <span className="text-xs text-fg-subtle">→</span>
        <input
          type="date"
          value={filter.to ?? ""}
          onChange={(e) => update({ to: e.target.value })}
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-bg">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2.5">Time</th>
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5 font-mono">Entity ID</th>
              <th className="px-4 py-2.5 font-mono">Actor</th>
              <th className="px-4 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-fg-subtle"
                >
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-fg-subtle"
                >
                  No audit logs match the current filter.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td
                    className="px-4 py-2.5 text-xs text-fg-muted"
                    title={new Date(l.created_at).toLocaleString("id-ID")}
                  >
                    {timeAgo(l.created_at)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${EVENT_BADGE[l.event_type] ?? "bg-bg-subtle text-fg-muted"}`}
                    >
                      {l.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${ENTITY_BADGE[l.entity_type] ?? "bg-bg-subtle text-fg-muted"}`}
                    >
                      {l.entity_type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle"
                    title={l.entity_id}
                  >
                    {l.entity_id.slice(0, 8)}…
                  </td>
                  <td
                    className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle"
                    title={l.actor_user_id ?? ""}
                  >
                    {l.actor_user_id
                      ? `${l.actor_user_id.slice(0, 8)}…`
                      : "System"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="text-xs text-accent">View →</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-muted">
          Total {total} · Page size {limit}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={(filter.offset ?? 0) === 0}
            onClick={() => page((filter.offset ?? 0) - limit)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={(filter.offset ?? 0) + limit >= total}
            onClick={() => page((filter.offset ?? 0) + limit)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-bg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${ENTITY_BADGE[selected.entity_type] ?? "bg-bg-subtle text-fg-muted"}`}
                  >
                    {selected.entity_type.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${EVENT_BADGE[selected.event_type] ?? "bg-bg-subtle text-fg-muted"}`}
                  >
                    {selected.event_type}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-fg-subtle">
                  Entity ID: {selected.entity_id}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {selected.actor_user_id
                    ? `By ${selected.actor_user_id.slice(0, 8)}…`
                    : "System"}{" "}
                  · {new Date(selected.created_at).toLocaleString("id-ID")}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(null)}
              >
                Close
              </Button>
            </div>

            <div className="mb-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <p className="text-xs font-semibold uppercase tracking-wide text-fg">
                Changed fields (
                {diffJson(selected.old_data, selected.new_data).length})
              </p>
            </div>
            <table className="w-full text-xs">
              <thead className="text-fg-subtle">
                <tr>
                  <th className="py-1 text-left">Field</th>
                  <th className="py-1 text-left">Old</th>
                  <th className="py-1 text-left">New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {diffJson(selected.old_data, selected.new_data).map((d) => (
                  <tr key={d.key}>
                    <td className="py-1 font-mono text-accent">{d.key}</td>
                    <td className="py-1 text-danger">
                      {JSON.stringify(d.old)}
                    </td>
                    <td className="py-1 text-success">
                      {JSON.stringify(d.new)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <details className="mt-4 rounded-md border border-border bg-bg-subtle p-2">
              <summary className="cursor-pointer text-xs font-medium text-fg-muted">
                Raw JSON
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-fg-subtle">
                {JSON.stringify(selected, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
  );
}

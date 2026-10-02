"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { useToast } from "@/components/ui/toast";
import {
  listAuditLogs,
  type AuditFilter,
  type AuditLog,
} from "@/lib/api/audit";

const ENTITY_TYPES = [
  "sales_orders",
  "purchase_requests",
  "approval_instances",
  "customer_invoices",
  "supplier_invoices",
  "customers",
  "suppliers",
  "products",
];
const EVENT_TYPES = ["INSERT", "UPDATE", "DELETE"];

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

export default function AuditLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<AuditFilter>({
    entity_type: "",
    event_type: "",
    limit: 100,
    offset: 0,
  });
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs(filter);
      setLogs(res.data);
      setTotal(res.total);
    } catch (e: any) {
      toast.error("Load failed", e.message);
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const byType: Record<string, number> = {};
    const byEvent: Record<string, number> = {};
    for (const l of logs) {
      byType[l.entity_type] = (byType[l.entity_type] ?? 0) + 1;
      byEvent[l.event_type] = (byEvent[l.event_type] ?? 0) + 1;
    }
    return { byType, byEvent };
  }, [logs]);

  const update = (patch: Partial<AuditFilter>) =>
    setFilter((f) => ({ ...f, ...patch, offset: 0 }));
  const page = (offset: number) => setFilter((f) => ({ ...f, offset }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Audit logs</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Immutable event trail for critical entities. Developer-only.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Total events" value={String(total)} sub="All time" />
        <KpiCard
          label="INSERT"
          value={String(stats.byEvent.INSERT ?? 0)}
          sub="Created"
        />
        <KpiCard
          label="UPDATE"
          value={String(stats.byEvent.UPDATE ?? 0)}
          sub="Modified"
        />
        <KpiCard
          label="DELETE"
          value={String(stats.byEvent.DELETE ?? 0)}
          sub="Removed"
        />
        <KpiCard
          label="Showing"
          value={String(logs.length)}
          sub={`Page ${Math.floor((filter.offset ?? 0) / (filter.limit ?? 100)) + 1}`}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-bg p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Entity type
          </label>
          <select
            value={filter.entity_type ?? ""}
            onChange={(e) => update({ entity_type: e.target.value })}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Event
          </label>
          <select
            value={filter.event_type ?? ""}
            onChange={(e) => update({ event_type: e.target.value })}
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          >
            <option value="">All events</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Entity ID
          </label>
          <input
            value={filter.entity_id ?? ""}
            onChange={(e) => update({ entity_id: e.target.value })}
            placeholder="UUID"
            className="w-48 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Actor ID
          </label>
          <input
            value={filter.actor_id ?? ""}
            onChange={(e) => update({ actor_id: e.target.value })}
            placeholder="UUID"
            className="w-48 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
          />
        </div>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2.5">Time</th>
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5 font-mono">Entity ID</th>
              <th className="px-4 py-2.5 font-mono">Actor</th>
              <th className="px-4 py-2.5 w-24" />
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
                  No audit logs match current filter.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="cursor-pointer transition-colors hover:bg-bg-subtle/50"
                >
                  <td className="px-4 py-2.5 text-xs text-fg-muted">
                    {new Date(l.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${l.event_type === "INSERT" ? "bg-success/10 text-success" : l.event_type === "UPDATE" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}
                    >
                      {l.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg">
                    {l.entity_type}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle">
                    {l.entity_id.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-fg-subtle">
                    {l.actor_user_id ? l.actor_user_id.slice(0, 8) + "…" : "—"}
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

      <div className="flex items-center justify-between">
        <p className="text-xs text-fg-muted">
          Total {total} · Page size {filter.limit}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={(filter.offset ?? 0) === 0}
            onClick={() => page((filter.offset ?? 0) - (filter.limit ?? 100))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={(filter.offset ?? 0) + (filter.limit ?? 100) >= total}
            onClick={() => page((filter.offset ?? 0) + (filter.limit ?? 100))}
          >
            Next
          </Button>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-bg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-fg-muted">
                  {selected.entity_type} · {selected.event_type}
                </p>
                <p className="mt-1 font-mono text-xs text-fg-subtle">
                  ID: {selected.entity_id}
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
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                  Changed fields
                </p>
                <table className="mt-2 w-full text-xs">
                  <thead className="text-fg-subtle">
                    <tr>
                      <th className="text-left py-1">Field</th>
                      <th className="text-left py-1">Old</th>
                      <th className="text-left py-1">New</th>
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
              </div>
              <details className="rounded-md border border-border bg-bg-subtle p-2">
                <summary className="cursor-pointer text-xs font-medium text-fg-muted">
                  Raw JSON
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-[10px] text-fg-subtle">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

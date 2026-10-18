"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api/client";
import { API_BASE } from "@/lib/api/base";
import { resolveLabels } from "@/lib/api/lookup";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatAuditValue } from "@/lib/format-audit";
import { realtime } from "@/lib/realtime";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AuditLog = {
  id: number;
  tenant_id: string;
  actor_user_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  old_data: any;
  new_data: any;
  metadata: any;
  created_at: string;
};

export default function AuditLogsPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    entityType: "",
  });
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});

  // Load dengan AbortController + hard timeout 15s (anti "Loading..." forever)
  const load = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (filter.entityType) params.set("entity_type", filter.entityType);
      if (filter.from) params.set("from", filter.from);
      if (filter.to) params.set("to", filter.to);
      params.set("limit", "500");
      const res = await apiFetch<{ data: AuditLog[]; pagination: any }>(
        `/audit-logs?${params.toString()}`,
        { signal: ctrl.signal },
      );
      setLogs(res.data ?? []);
    } catch (err: any) {
      const msg =
        err?.name === "AbortError"
          ? "Timeout >15s: koneksi browser kemungkinan jenuh/antre. Tutup tab localhost lain, hard-refresh (Ctrl+Shift+R), atau coba incognito."
          : (err?.message ?? "Failed to load");
      setLoadError(msg);
      toast.error("Load failed", msg);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.from, filter.to, filter.entityType]);

  useEffect(() => {
    load();
  }, [load]);

  // Subscribe ke SATU WebSocket bersama (dimiliki topbar via realtime.ts).
  // Event audit tiba sebagai kind === "audit_event" → refresh tabel.
  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.kind === "audit_event") {
        load();
      }
    });
    return off;
  }, [load]);

  const filtered = useMemo(
    () =>
      logs.filter((l) =>
        fuzzyMatch(query, [
          l.entity_type,
          l.entity_id,
          l.event_type,
          l.actor_user_id ?? "",
        ]),
      ),
    [logs, query],
  );

  const entityTypeOptions = useMemo(() => {
    const set = new Set(logs.map((l) => l.entity_type));
    return Array.from(set).sort();
  }, [logs]);

  const handleExport = (format: "xlsx" | "json") => {
    const params = new URLSearchParams({ format });
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    window.open(`${API_BASE}/audit-logs/export?${params.toString()}`, "_blank");
  };

  // Raw renderer: dipakai untuk DETEKSI perubahan (equality), bukan tampilan.
  const renderValue = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  const diff = useMemo(() => {
    if (!selected) return [];
    const old = selected.old_data ?? {};
    const neo = selected.new_data ?? {};
    const keys = new Set([
      ...Object.keys(old ?? {}),
      ...Object.keys(neo ?? {}),
    ]);
    const rows: { field: string; oldVal: any; newVal: any }[] = [];
    for (const k of keys) {
      if (["id", "tenant_id", "created_at", "updated_at"].includes(k)) continue;
      const ov = old?.[k];
      const nv = neo?.[k];
      if (renderValue(ov) !== renderValue(nv)) {
        rows.push({ field: k, oldVal: ov, newVal: nv });
      }
    }
    return rows;
  }, [selected]);

  // Best-effort UUID→label resolution untuk modal detail yang terbuka.
  useEffect(() => {
    if (!selected) return;
    const ids = new Set<string>();
    if (UUID_RE.test(selected.entity_id)) ids.add(selected.entity_id);
    if (selected.actor_user_id && UUID_RE.test(selected.actor_user_id)) {
      ids.add(selected.actor_user_id);
    }
    for (const d of diff) {
      for (const v of [d.oldVal, d.newVal]) {
        if (typeof v === "string" && UUID_RE.test(v)) ids.add(v);
      }
    }
    const missing = [...ids].filter((id) => !labels[id]);
    if (missing.length === 0) return;
    let alive = true;
    resolveLabels(missing)
      .then((res) => {
        if (alive) setLabels((prev) => ({ ...prev, ...res }));
      })
      .catch(() => {
        /* labels best-effort: biarkan UUID mentah bila gagal */
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, diff]);

  // Tampilan diff: UUID → label bila dikenal, selain itu formatter pintar.
  const displayDiff = (field: string, val: any): string => {
    if (typeof val === "string" && UUID_RE.test(val)) {
      return labels[val] ?? val;
    }
    return formatAuditValue(field, val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/developer"
            className="mb-2 inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            ← Developer suite
          </Link>
          <h1 className="text-2xl font-semibold text-fg">Audit Logs</h1>
          <p className="text-sm text-fg-muted">
            Jejak perubahan lengkap: siapa, kapan, apa yang berubah.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} disabled={loading}>
            Refresh
          </Button>
          <Button variant="secondary" onClick={() => handleExport("xlsx")}>
            Export Excel
          </Button>
          <Button variant="ghost" onClick={() => handleExport("json")}>
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-bg-surface p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            From
          </label>
          <input
            type="date"
            value={filter.from}
            onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value }))}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            To
          </label>
          <input
            type="date"
            value={filter.to}
            onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value }))}
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Entity Type
          </label>
          <select
            value={filter.entityType}
            onChange={(e) =>
              setFilter((f) => ({ ...f, entityType: e.target.value }))
            }
            className="rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-fg"
          >
            <option value="">All</option>
            {entityTypeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-fg-muted">
            Search
          </label>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="entity, ID, actor..."
          />
        </div>
      </div>

      {/* Error banner (muncul saat load timeout/gagal) */}
      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span>{loadError}</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {/* Main table */}
      <div className="overflow-hidden rounded-lg border border-border bg-bg-surface">
        {loading ? (
          <div className="p-12 text-center text-sm text-fg-muted">
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No audit events"
            description="Tidak ada event audit yang cocok dengan filter."
          />
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-bg-subtle text-left text-xs uppercase tracking-wider text-fg-muted">
                <tr>
                  <th className="px-4 py-2">Waktu</th>
                  <th className="px-4 py-2">Event</th>
                  <th className="px-4 py-2">Entity</th>
                  <th className="px-4 py-2">ID</th>
                  <th className="px-4 py-2">Actor</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => setSelected(l)}
                    className="cursor-pointer hover:bg-bg-subtle"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-fg-muted">
                      {new Date(l.created_at).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          l.event_type === "INSERT"
                            ? "bg-success/10 text-success"
                            : l.event_type === "UPDATE"
                              ? "bg-info/10 text-info"
                              : "bg-danger/10 text-danger"
                        }`}
                      >
                        {l.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-fg">{l.entity_type}</td>
                    <td className="px-4 py-2 font-mono text-xs text-fg-muted">
                      {l.entity_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 text-fg-muted">
                      {l.actor_user_id
                        ? `${l.actor_user_id.slice(0, 8)}…`
                        : "system"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost">
                        Detail
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="modal-fade fixed inset-0 z-50 flex items-center justify-center bg-black p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-auto modal-pop rounded-xl border border-white/10 bg-[#151a21] p-6 shadow-2xl shadow-black/70 ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">Audit Detail</h2>
              <button
                onClick={() => setSelected(null)}
                className="rounded p-1 text-fg-muted hover:bg-bg-subtle hover:text-fg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Metadata grid */}
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-fg-muted">Waktu</div>
                <div className="font-mono text-fg">
                  {new Date(selected.created_at).toLocaleString("id-ID")}
                </div>
              </div>
              <div>
                <div className="text-xs text-fg-muted">Event</div>
                <div className="text-fg">{selected.event_type}</div>
              </div>
              <div>
                <div className="text-xs text-fg-muted">Entity</div>
                <div className="text-fg">{selected.entity_type}</div>
              </div>
              <div>
                <div className="text-xs text-fg-muted">Entity ID</div>
                <div
                  className="font-mono text-xs text-fg"
                  title={selected.entity_id}
                >
                  {labels[selected.entity_id] ?? selected.entity_id}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-fg-muted">Actor</div>
                <div
                  className="font-mono text-xs text-fg"
                  title={selected.actor_user_id ?? undefined}
                >
                  {selected.actor_user_id
                    ? (labels[selected.actor_user_id] ?? selected.actor_user_id)
                    : "system"}
                </div>
              </div>
            </div>

            {/* Diff table */}
            <h3 className="mb-2 text-sm font-semibold text-fg">
              Perubahan ({diff.length} field)
            </h3>
            {diff.length === 0 ? (
              <p className="text-sm text-fg-muted">
                Tidak ada perubahan field yang dilacak.
              </p>
            ) : (
              <div className="overflow-hidden rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-bg-subtle text-left text-xs uppercase text-fg-muted">
                    <tr>
                      <th className="px-3 py-2">Field</th>
                      <th className="px-3 py-2">Old</th>
                      <th className="px-3 py-2">New</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {diff.map((d) => (
                      <tr key={d.field}>
                        <td className="px-3 py-2 font-mono text-xs font-medium text-fg">
                          {d.field}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-xs text-danger"
                          title={
                            typeof d.oldVal === "string" ? d.oldVal : undefined
                          }
                        >
                          {displayDiff(d.field, d.oldVal)}
                        </td>
                        <td
                          className="px-3 py-2 font-mono text-xs text-success"
                          title={
                            typeof d.newVal === "string" ? d.newVal : undefined
                          }
                        >
                          {displayDiff(d.field, d.newVal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

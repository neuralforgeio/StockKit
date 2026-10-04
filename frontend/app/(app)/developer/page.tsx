"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/kpi-card";
import { MatrixRain } from "@/components/ui/matrix-rain";
import { useToast } from "@/components/ui/toast";
import {
  getDevAnalytics,
  getDevDisk,
  getDevLogs,
  getDevMe,
  getDevMetrics,
  type DevAnalytics,
  type DevDisk,
  type DevMe,
  type DevMetrics,
} from "@/lib/api/dev";

const LEVEL_COLORS: Record<string, string> = {
  INFO: "#34D399",
  WARN: "#FBBF24",
  ERROR: "#F87171",
  DEBUG: "#9CA3AF",
};
const STATUS_COLORS: Record<string, string> = {
  "2xx": "#34D399",
  "4xx": "#FBBF24",
  "5xx": "#F87171",
  other: "#9CA3AF",
};

function fmtBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}
function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function DeveloperPage() {
  const toast = useToast();
  const [me, setMe] = useState<DevMe | null>(null);
  const [metrics, setMetrics] = useState<DevMetrics | null>(null);
  const [disk, setDisk] = useState<DevDisk | null>(null);
  const [analytics, setAnalytics] = useState<DevAnalytics | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [logFile, setLogFile] = useState("");
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    try {
      setMe(await getDevMe());
    } catch (e: any) {
      toast.error("Auth failed", e.message);
    }
  }, [toast]);

  const loadLogs = useCallback(async () => {
    try {
      const l = await getDevLogs(300);
      setLines(l.lines);
      setLogFile(l.file);
    } catch {
      /* silent */
    }
  }, []);

  const loadMetrics = useCallback(async () => {
    const [m, d, a] = await Promise.allSettled([
      getDevMetrics(),
      getDevDisk(),
      getDevAnalytics(),
    ]);
    if (m.status === "fulfilled") setMetrics(m.value);
    if (d.status === "fulfilled") setDisk(d.value);
    if (a.status === "fulfilled") setAnalytics(a.value);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMe();
      await Promise.all([loadLogs(), loadMetrics()]);
      setLoading(false);
    })();
  }, [loadMe, loadLogs, loadMetrics]);

  useEffect(() => {
    if (!autoRefresh || !me?.is_developer) return;
    const tl = setInterval(loadLogs, 3000);
    const tm = setInterval(loadMetrics, 10000);
    return () => {
      clearInterval(tl);
      clearInterval(tm);
    };
  }, [autoRefresh, me, loadLogs, loadMetrics]);

  const parsed = useMemo(() => {
    return lines
      .map((raw) => {
        try {
          const o = JSON.parse(raw);
          return {
            level: String(o.level ?? "INFO"),
            msg: String(o.msg ?? ""),
            time: String(o.time ?? ""),
            rest: raw,
          };
        } catch {
          return { level: "INFO", msg: raw, time: "", rest: raw };
        }
      })
      .filter((l) => (levelFilter === "ALL" ? true : l.level === levelFilter))
      .filter((l) =>
        search
          ? (l.msg + l.rest).toLowerCase().includes(search.toLowerCase())
          : true,
      )
      .reverse();
  }, [lines, levelFilter, search]);

  const statusData = useMemo(() => {
    if (!analytics) return [];
    return Object.entries(analytics.status)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: k, value: v }));
  }, [analytics]);

  if (loading)
    return (
      <div className="h-72 animate-pulse rounded-xl border border-border bg-bg" />
    );

  if (!me?.is_developer) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-xl border border-border bg-bg p-8 text-center">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-3 text-xl font-semibold text-fg">Access denied</h1>
          <p className="mt-2 text-sm text-fg-muted">
            The Developer suite is restricted to the{" "}
            <span className="font-mono text-accent">developer</span> role.
            {me?.is_owner
              ? " Owner accounts cannot access developer tooling."
              : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-border bg-[#0B0D10]">
        <MatrixRain className="absolute inset-0 h-full w-full opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Developer suite
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Runtime metrics, request analytics, disk & live logs. Developer
              role only.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Auto-refresh
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                loadLogs();
                loadMetrics();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Developer Tools Grid — navigasi cepat ke sub-tools ===== */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/developer/audit"
          className="group flex flex-col gap-2 rounded-xl border border-border bg-bg p-5 transition hover:border-accent hover:shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-fg">Audit Logs</h3>
          </div>
          <p className="text-xs text-fg-muted">
            Jejak perubahan lengkap di semua entitas sistem. Siapa, kapan, apa.
          </p>
          <span className="mt-auto text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100">
            Buka →
          </span>
        </Link>

        <div className="group flex flex-col gap-2 rounded-xl border border-border bg-bg p-5 transition hover:border-accent hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-fg">Runtime Metrics</h3>
          </div>
          <p className="text-xs text-fg-muted">
            Goroutines, heap, DB pool, uptime. Lihat di bawah.
          </p>
          <span className="mt-auto text-xs font-medium text-info">Aktif ✓</span>
        </div>

        <div className="group flex flex-col gap-2 rounded-xl border border-border bg-bg p-5 transition hover:border-accent hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-fg">
              Request Analytics
            </h3>
          </div>
          <p className="text-xs text-fg-muted">
            Requests/hour, status distribution, top endpoints.
          </p>
          <span className="mt-auto text-xs font-medium text-success">
            Aktif ✓
          </span>
        </div>

        <div className="group flex flex-col gap-2 rounded-xl border border-border bg-bg p-5 transition hover:border-accent hover:shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-fg">Live Logs</h3>
          </div>
          <p className="text-xs text-fg-muted">
            Streaming log aplikasi 3s, filter level & teks.
          </p>
          <span className="mt-auto text-xs font-medium text-warning">
            Aktif ✓
          </span>
        </div>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Goroutines"
            value={String(metrics.goroutines)}
            sub={`${metrics.go_os}/${metrics.go_arch}`}
          />
          <KpiCard
            label="Heap alloc"
            value={`${metrics.heap_alloc_mb.toFixed(1)} MB`}
            sub={`sys ${metrics.heap_sys_mb.toFixed(1)} MB`}
          />
          <KpiCard
            label="DB pool"
            value={`${metrics.db_acquired}/${metrics.db_total_conns}`}
            sub={`${metrics.db_idle_conns} idle`}
          />
          <KpiCard
            label="Uptime"
            value={fmtUptime(metrics.uptime_seconds)}
            sub={`GC ${metrics.gc_cycles} cycles`}
          />
        </div>
      )}

      {disk && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Log storage
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-fg">
              {fmtBytes(disk.log_bytes)}
            </p>
            <p className="mt-1 text-[11px] text-fg-subtle">
              {disk.log_files} file(s) · daily rotation
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Disk free
            </p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-fg">
              {disk.os_ok && disk.free_bytes
                ? fmtBytes(disk.free_bytes)
                : "n/a"}
            </p>
            <p className="mt-1 text-[11px] text-fg-subtle">
              {disk.os_ok && disk.total_bytes
                ? `of ${fmtBytes(disk.total_bytes)}`
                : "OS disk not readable"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Disk used
            </p>
            <div className="mt-3 h-2 rounded-full bg-bg-subtle">
              <div
                className={`h-full rounded-full ${disk.used_pct && disk.used_pct > 85 ? "bg-danger" : disk.used_pct && disk.used_pct > 70 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(100, disk.used_pct ?? 0)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-fg-subtle">
              {disk.used_pct ? `${disk.used_pct.toFixed(1)}% used` : "n/a"}
            </p>
          </div>
        </div>
      )}

      {analytics && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-bg p-4 lg:col-span-2">
            <h3 className="text-sm font-semibold text-fg">
              Requests / hour (24h)
            </h3>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.per_hour}>
                  <CartesianGrid
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 9, fill: "var(--color-fg-subtle)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "var(--color-fg-subtle)" }}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#2563EB" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4">
            <h3 className="text-sm font-semibold text-fg">
              Status distribution
            </h3>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {statusData.map((s) => (
                      <Cell
                        key={s.name}
                        fill={STATUS_COLORS[s.name] ?? "#9CA3AF"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-bg p-4 lg:col-span-3">
            <h3 className="text-sm font-semibold text-fg">Top endpoints</h3>
            <div className="mt-3 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.top_endpoints} layout="vertical">
                  <CartesianGrid
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 9, fill: "var(--color-fg-subtle)" }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="endpoint"
                    tick={{ fontSize: 9, fill: "var(--color-fg-subtle)" }}
                    width={160}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-bg)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#059669" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-bg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">
            Live logs · {logFile || "—"}{" "}
            <span
              className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-success"
              title="auto-refresh 3s"
            />
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
            >
              {["ALL", "INFO", "WARN", "ERROR", "DEBUG"].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter text"
              className="w-40 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg"
            />
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto bg-[#0B0D10] p-3 font-mono text-[11px] leading-relaxed">
          {parsed.length === 0 ? (
            <p className="text-white/40">
              No log lines match the current filter.
            </p>
          ) : (
            parsed.map((l, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                <span className="text-white/40">
                  {l.time ? new Date(l.time).toLocaleTimeString("id-ID") : ""}
                </span>{" "}
                <span
                  className="font-semibold"
                  style={{ color: LEVEL_COLORS[l.level] ?? "#fff" }}
                >
                  {l.level.padEnd(5)}
                </span>{" "}
                <span className="text-white/90">{l.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

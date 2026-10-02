"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";
import { cityLabel, IndonesiaMap } from "@/components/dashboard/indonesia-map";
import { Button } from "@/components/ui/button";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { getSummary, type DashboardSummary } from "@/lib/api/dashboard";
import {
  listMovements,
  listStockLevels,
  type Movement,
  type StockLevel,
} from "@/lib/api/inventory";
import {
  imageContentUrl,
  listProducts,
  type Product,
} from "@/lib/api/products";
import { getMe } from "@/lib/api/users";
import { formatIDR } from "@/lib/format";

const DAY_MS = 86_400_000;

const GRAD_BLUE =
  "bg-[linear-gradient(140deg,#2563EB_0%,#1E3A8A_60%,#172554_100%)]";
const GRAD_GREEN =
  "bg-[linear-gradient(140deg,#059669_0%,#065F46_60%,#064E3B_100%)]";
const GRAD_AMBER =
  "bg-[linear-gradient(140deg,#D97706_0%,#92400E_60%,#7C2D12_100%)]";

function daysAgo(ts: string): number {
  return Math.floor((Date.now() - new Date(ts).getTime()) / DAY_MS);
}

function ValueArea({ series }: { series: number[] }) {
  const data = series.map((v, i) => ({ i, v }));
  return (
    <div className="h-12 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="dashValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#BFDBFE" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#BFDBFE" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke="#BFDBFE"
            strokeWidth={1.5}
            fill="url(#dashValue)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CoverageGauge({ pct, center }: { pct: number; center: string }) {
  const data = [{ value: Math.round(Math.max(0, Math.min(1, pct)) * 100) }];
  return (
    <div className="relative">
      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="100%"
            innerRadius="72%"
            outerRadius="100%"
            startAngle={180}
            endAngle={0}
            data={data}
            barSize={9}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={999}
              fill="#A7F3D0"
              background={{ fill: "rgba(255,255,255,0.18)" }}
              isAnimationActive={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-0 text-center text-2xl font-semibold tabular-nums text-white">
        {center}
      </p>
    </div>
  );
}

function LowStockDonut({
  segments,
  center,
}: {
  segments: { value: number; color: string }[];
  center: string;
}) {
  return (
    <div className="relative h-24 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            innerRadius={28}
            outerRadius={44}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {segments.map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums text-white">
        {center}
      </span>
    </div>
  );
}

function ScanModal({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
}) {
  const [code, setCode] = useState("");
  const matches = useMemo(
    () =>
      code.trim() === ""
        ? []
        : products.filter(
            (p) =>
              p.sku.toLowerCase().includes(code.toLowerCase()) ||
              (p.barcode ?? "").includes(code),
          ),
    [code, products],
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan barcode"
      size="sm"
      icon={<ModalIcon path="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14" />}
    >
      <p className="text-sm text-fg-muted">
        Use a hardware scanner or type the code. Matching products appear below.
      </p>
      <input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mt-3 block w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
        placeholder="SKU or barcode"
      />
      <div className="mt-3 space-y-2">
        {matches.slice(0, 5).map((p) => (
          <Link
            key={p.id}
            href={`/products`}
            onClick={onClose}
            className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-sm transition-colors hover:border-accent"
          >
            <span className="truncate text-fg">{p.name}</span>
            <span className="ml-2 font-mono text-xs text-accent">{p.sku}</span>
          </Link>
        ))}
        {code.trim() !== "" && matches.length === 0 && (
          <p className="text-sm text-fg-subtle">
            No product matches this code.
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function DashboardPage() {
  const toast = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [mapView, setMapView] = useState(true);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      getSummary(),
      listMovements({ limit: 500 }),
      listStockLevels(),
      listProducts(undefined, 100),
      getMe(),
    ])
      .then(([s, m, sl, p, me]) => {
        setSummary(s);
        setMovements(m.data);
        setStock(sl);
        setProducts(p.data);
        setUserName(me.full_name.split(" ")[0]);
      })
      .catch((e) => toast.error("Unable to load dashboard", e.message))
      .finally(() => setLoading(false));
  }, [toast]);

  const derived = useMemo(() => {
    if (!summary) return null;
    const currentValue = summary.inventory_value_minor;
    let inValue = 0;
    let outValue = 0;
    const dayNet = Array.from({ length: 30 }, () => 0);
    for (const m of movements) {
      const d = daysAgo(m.created_at);
      const val = m.movement_type.includes("IN")
        ? m.qty * m.unit_cost_minor
        : (m.cogs_minor ?? m.qty * m.unit_cost_minor);
      if (d >= 0 && d < 30)
        dayNet[29 - d] += m.movement_type.includes("IN") ? val : -val;
      if (m.movement_type.includes("IN")) inValue += val;
      else outValue += val;
    }
    const pastValue = Math.max(0, currentValue - inValue + outValue);
    const deltaPct =
      pastValue > 0 ? ((currentValue - pastValue) / pastValue) * 100 : 0;
    let running = pastValue;
    const valueSeries = dayNet.map((n) => {
      running += n;
      return running;
    });

    const onHandByProduct = new Map<string, number>();
    for (const s of stock)
      onHandByProduct.set(
        s.product_id,
        (onHandByProduct.get(s.product_id) ?? 0) + s.on_hand,
      );
    let gap = 0;
    const lowItems: {
      name: string;
      sku: string;
      onHand: number;
      min: number;
    }[] = [];
    for (const p of products) {
      const onHand = onHandByProduct.get(p.id) ?? 0;
      if (onHand < p.min_stock) {
        gap += p.min_stock - onHand;
        lowItems.push({ name: p.name, sku: p.sku, onHand, min: p.min_stock });
      }
    }
    const coverage =
      gap === 0 ? 1 : summary.units_on_hand / (summary.units_on_hand + gap);

    const lowByWarehouse = new Map<string, number>();
    for (const s of stock) {
      const p = products.find((x) => x.id === s.product_id);
      if (p && s.on_hand < p.min_stock)
        lowByWarehouse.set(
          s.warehouse_code,
          (lowByWarehouse.get(s.warehouse_code) ?? 0) + 1,
        );
    }
    const donutSegments =
      lowByWarehouse.size > 0
        ? [...lowByWarehouse.values()].map((v, i) => ({
            value: v,
            color: i % 2 === 0 ? "#FDE68A" : "#FCA5A5",
          }))
        : [{ value: 1, color: "#A7F3D0" }];

    const insights: { tone: "warning" | "danger" | "info"; text: string }[] =
      [];
    for (const item of lowItems.slice(0, 2)) {
      insights.push({
        tone: "warning",
        text: `${item.name} is below minimum stock (${item.onHand}/${item.min}). Reorder suggested.`,
      });
    }
    for (const p of products) {
      if (p.default_buy_price_minor > 0) {
        const margin =
          ((p.default_sell_price_minor - p.default_buy_price_minor) /
            p.default_buy_price_minor) *
          100;
        if (margin < 10) {
          insights.push({
            tone: "info",
            text: `${p.name} margin is ${margin.toFixed(1)}%. Price review suggested.`,
          });
          break;
        }
      }
    }
    const out7 = new Map<string, number>();
    for (const m of movements) {
      if (m.movement_type === "OUT" && daysAgo(m.created_at) < 7)
        out7.set(m.product_sku, (out7.get(m.product_sku) ?? 0) + m.qty);
    }
    const fastMover = [...out7.entries()].sort((a, b) => b[1] - a[1])[0];
    if (fastMover)
      insights.push({
        tone: "info",
        text: `${fastMover[0]} moved ${fastMover[1]} units in 7 days. Consider safety stock.`,
      });

    return {
      currentValue,
      pastValue,
      deltaPct,
      valueSeries,
      coverage,
      lowItems,
      donutSegments,
      insights,
    };
  }, [summary, movements, stock, products]);

  if (loading || !summary || !derived) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl border border-border bg-bg" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-border bg-bg"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-border bg-bg" />
      </div>
    );
  }

  const pins = summary.warehouses.map((w) => ({
    id: w.warehouse_id,
    label: cityLabel(w.name),
    units: w.units_on_hand,
    value: w.value_minor,
  }));

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-border bg-linear-to-r from-[#172554] via-[#1E40AF] to-[#2563EB] p-5 text-white">
        <h2 className="text-xl font-semibold tracking-tight">
          Welcome back, {userName || "there"}
        </h2>
        <p className="mt-1 text-sm text-white/70">
          Here is what is happening with your business today.
        </p>
        <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div
              className={`rounded-xl border border-border p-4 text-white ${GRAD_BLUE}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Inventory value
                </p>
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                  {derived.deltaPct >= 0 ? "+" : ""}
                  {derived.deltaPct.toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {formatIDR(derived.currentValue)}
              </p>
              <div className="mt-2">
                <ValueArea series={derived.valueSeries} />
              </div>
              <div className="mt-2 border-t border-white/15 pt-2">
                <p className="text-[11px] text-white/60">Past 30 days</p>
                <p className="text-sm font-medium tabular-nums text-white/90">
                  {formatIDR(derived.pastValue)}
                </p>
                <p className="mt-1 text-[11px] text-white/60">
                  {summary.sku_count} SKU tracked
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl border border-border p-4 text-white ${GRAD_GREEN}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Units on hand
                </p>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <CoverageGauge
                    pct={derived.coverage}
                    center={summary.units_on_hand.toLocaleString("id-ID")}
                  />
                </div>
                <div className="flex h-24 w-2 shrink-0 flex-col justify-end rounded-full bg-white/20">
                  <div
                    className="rounded-full bg-[#A7F3D0]"
                    style={{ height: `${Math.round(derived.coverage * 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-white/60">
                Total stock capacity · {summary.warehouses.length} warehouses
              </p>
            </div>

            <div
              className={`rounded-xl border border-border p-4 text-white ${GRAD_AMBER}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-white/70">
                  Low stock
                </p>
                {summary.low_stock_count > 0 && (
                  <span className="rounded-full bg-white/15 p-1 text-[#FDE68A]">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    </svg>
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <LowStockDonut
                  segments={derived.donutSegments}
                  center={String(summary.low_stock_count)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    Top items
                  </p>
                  <div className="mt-1 space-y-1">
                    {derived.lowItems.slice(0, 2).map((i) => (
                      <p key={i.sku} className="truncate text-xs text-white/85">
                        <span className="text-[#FDE68A]">•</span> {i.name} ·{" "}
                        {i.onHand}/{i.min}
                      </p>
                    ))}
                    {derived.lowItems.length === 0 && (
                      <p className="text-xs text-[#A7F3D0]">
                        All items above minimum
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-fg">
                Warehouse distribution
              </h3>
              <button
                onClick={() => setMapView((v) => !v)}
                className="flex items-center gap-2 text-[11px] font-medium text-fg-muted"
                aria-label="Toggle map or list view"
              >
                LIST
                <span
                  className={`relative h-4 w-8 rounded-full transition-colors ${mapView ? "bg-bg-subtle" : "bg-accent"}`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-fg transition-all ${mapView ? "left-0.5" : "left-4"}`}
                  />
                </span>
              </button>
            </div>
            <div className="p-4">
              {mapView ? (
                <IndonesiaMap pins={pins} />
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                    <tr>
                      <th className="py-1.5">Warehouse</th>
                      <th className="py-1.5 text-right">Units</th>
                      <th className="py-1.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {summary.warehouses.map((w) => (
                      <tr key={w.warehouse_id}>
                        <td className="py-2">
                          <span className="font-mono text-xs text-fg">
                            {w.code}
                          </span>
                          <span className="ml-2 text-fg-muted">{w.name}</span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-fg">
                          {w.units_on_hand.toLocaleString("id-ID")}
                        </td>
                        <td className="py-2 text-right tabular-nums text-fg">
                          {formatIDR(w.value_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-bg p-4">
            <h3 className="text-sm font-semibold text-fg">Quick actions</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <QuickTile
                href="/products"
                label="Product"
                icon="M21 8l-9-5-9 5v8l9 5 9-5V8z"
              />
              <QuickTile
                href="/inventory"
                label="Adjust"
                icon="M12 5v14M5 12h14"
              />
              <QuickTile
                href="/purchasing"
                label="New PR"
                icon="M6 6h15l-1.5 9h-12L6 6z"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setScanOpen(true)}
            >
              Scan barcode
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="var(--color-accent)"
                aria-hidden
              >
                <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" />
              </svg>
              <h3 className="text-sm font-semibold text-fg">Insights</h3>
            </div>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              Computed from your last 30 days of movements
            </p>
            <div className="mt-3 space-y-2">
              {derived.insights.slice(0, 3).map((ins, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-lg border border-border bg-bg-subtle/50 px-3 py-2"
                >
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${ins.tone === "warning" ? "bg-warning" : ins.tone === "danger" ? "bg-danger" : "bg-info"}`}
                  />
                  <p className="text-xs leading-relaxed text-fg-muted">
                    {ins.text}
                  </p>
                </div>
              ))}
              {derived.insights.length === 0 && (
                <p className="text-xs text-fg-subtle">
                  No actionable signals in the current window.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
              Recent movements
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-bg-subtle text-left font-medium uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-3 py-2">Seq</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Bal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {summary.recent_movements.map((m) => {
                    const product = products.find(
                      (p) => p.sku === m.product_sku,
                    );
                    return (
                      <tr
                        key={m.movement_seq}
                        className="hover:bg-bg-subtle/50"
                      >
                        <td className="px-3 py-2 tabular-nums text-fg-subtle">
                          {m.movement_seq}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${m.movement_type.includes("IN") ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                          >
                            {m.movement_type}
                          </span>
                        </td>
                        <td className="max-w-[120px] px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-bg-subtle">
                              {product?.primary_image_id ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={imageContentUrl(
                                    product.primary_image_id,
                                  )}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="font-mono text-[8px] text-fg-subtle">
                                  {m.product_sku.slice(0, 2)}
                                </span>
                              )}
                            </span>
                            <span
                              className="truncate text-fg"
                              title={m.product_name}
                            >
                              {m.product_name}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">
                          {m.qty}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">
                          {m.balance_after}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <ScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        products={products}
      />
    </div>
  );
}

function QuickTile({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-bg-subtle/50 px-2 py-3 text-[11px] font-medium text-fg-muted transition-colors hover:border-accent hover:text-accent"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden
      >
        <path d={icon} />
      </svg>
      {label}
    </Link>
  );
}

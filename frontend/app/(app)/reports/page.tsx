"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { SignaturePad } from "@/components/ui/signature-pad";
import { useToast } from "@/components/ui/toast";
import { listCustomers } from "@/lib/api/customers";
import { listMovements, listStockLevels } from "@/lib/api/inventory";
import { listPayments, listSupplierInvoices } from "@/lib/api/invoices";
import { listProducts } from "@/lib/api/products";
import {
  listCustomerInvoices,
  listCustomerReceipts,
  listSalesOrders,
} from "@/lib/api/sales";
import { getMe } from "@/lib/api/users";
import { listWarehouses } from "@/lib/api/warehouses";
import { buildFinancialWorkbook } from "@/lib/export/excel-report";
import { buildFinancialReport } from "@/lib/export/pdf-report";
import { computeReport } from "@/lib/export/report-data";
import { formatIDR } from "@/lib/format";

const PERIODS = [7, 30, 90] as const;
const SIG_KEY = "stockkit.signature.v1";
const SIG_NAME_KEY = "stockkit.signature.name";

const tint = {
  blue: "gradient-subtle-blue",
  green: "gradient-subtle-emerald",
  amber: "gradient-subtle-amber",
  purple: "gradient-subtle-purple",
};

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: keyof typeof tint;
}) {
  return (
    <div className={`rounded-xl border border-border p-4 ${tint[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-fg-subtle">{sub}</p>
    </div>
  );
}

export default function ReportsPage() {
  const toast = useToast();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(30);
  const [raw, setRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [meName, setMeName] = useState("");
  const [savedSig, setSavedSig] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        stock,
        movements,
        products,
        warehouses,
        salesOrders,
        customerInvoices,
        customerReceipts,
        supplierInvoices,
        payments,
        customers,
        me,
      ] = await Promise.all([
        listStockLevels(),
        listMovements({ limit: 800 }),
        listProducts(undefined, 100),
        listWarehouses(),
        listSalesOrders(),
        listCustomerInvoices(),
        listCustomerReceipts(),
        listSupplierInvoices(),
        listPayments(),
        listCustomers(),
        getMe(),
      ]);
      setRaw({
        stock,
        movements: movements.data,
        products: products.data,
        warehouses,
        salesOrders,
        customerInvoices,
        customerReceipts,
        supplierInvoices,
        payments,
        customers,
      });
      setMeName(me.full_name);
      setSavedSig(window.localStorage.getItem(SIG_KEY));
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const d = useMemo(
    () => (raw ? computeReport(raw, period) : null),
    [raw, period],
  );

  const pieData = useMemo(() => {
    if (!d) return [];
    return [
      { name: "Piutang (AR)", value: d.totals.ar, color: "#2563EB" },
      { name: "Utang (AP)", value: d.totals.ap, color: "#D97706" },
      {
        name: "Kas bersih",
        value: Math.max(0, d.totals.netCash),
        color: "#059669",
      },
    ].filter((x) => x.value > 0);
  }, [d]);

  const handlePDF = () => {
    setSignOpen(true);
  };

  const handleSigned = async (name: string, signature: string) => {
    setSignOpen(false);
    window.localStorage.setItem(SIG_KEY, signature);
    window.localStorage.setItem(SIG_NAME_KEY, name);
    setSavedSig(signature);
    if (!d) return;
    setExporting("pdf");
    try {
      await buildFinancialReport(d, { name, signature });
      toast.success("PDF exported", `Signed by ${name} and downloaded.`);
    } catch (err: any) {
      toast.error("Export failed", err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExcel = async () => {
    if (!d) return;
    setExporting("xlsx");
    try {
      await buildFinancialWorkbook(d);
      toast.success(
        "Excel exported",
        "Styled workbook with centered print layout downloaded.",
      );
    } catch (err: any) {
      toast.error("Export failed", err.message);
    } finally {
      setExporting(null);
    }
  };

  if (loading || !d) {
    return (
      <div className="h-72 animate-pulse rounded-xl border border-border bg-bg" />
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Reports</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Financial & operational analysis with exportable documents.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-bg p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-accent-solid text-white"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={handlePDF}
            disabled={exporting !== null}
          >
            {exporting === "pdf" ? "Building..." : "Export PDF"}
          </Button>
          <Button
            variant="secondary"
            onClick={handleExcel}
            disabled={exporting !== null}
          >
            {exporting === "xlsx" ? "Building..." : "Export Excel"}
          </Button>
        </div>
      </header>

      {savedSig && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={savedSig}
            alt="Saved signature"
            className="h-8 w-20 rounded border border-border bg-white object-contain"
          />
          <p className="text-xs text-fg-muted">
            Signature on file for{" "}
            <span className="font-medium text-fg">
              {window.localStorage.getItem(SIG_NAME_KEY) || meName}
            </span>
            . You will be asked to confirm or redraw before each PDF export.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Inventory value"
          value={formatIDR(d.totals.inventoryValue)}
          sub={`${d.counts.skus} SKU · ${d.counts.warehouses} gudang`}
          tone="blue"
        />
        <Stat
          label="Revenue"
          value={formatIDR(d.totals.revenue)}
          sub={`Periode ${period} hari`}
          tone="green"
        />
        <Stat
          label="COGS"
          value={formatIDR(d.totals.cogs)}
          sub={`Margin ${d.totals.marginPct.toFixed(1)}%`}
          tone="amber"
        />
        <Stat
          label="Gross profit"
          value={formatIDR(d.totals.grossProfit)}
          sub="Revenue less COGS"
          tone="purple"
        />
        <Stat
          label="Receivable (AR)"
          value={formatIDR(d.totals.ar)}
          sub={`${d.counts.openAR} faktur terbuka`}
          tone="blue"
        />
        <Stat
          label="Payable (AP)"
          value={formatIDR(d.totals.ap)}
          sub={`${d.counts.openAP} faktur terbuka`}
          tone="amber"
        />
        <Stat
          label="Net working"
          value={formatIDR(d.totals.netWorking)}
          sub="AR less AP"
          tone="green"
        />
        <Stat
          label="Net cash flow"
          value={formatIDR(d.totals.netCash)}
          sub={`${d.counts.receipts} receipt · ${d.counts.payments} payment`}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg p-4 xl:col-span-2">
          <h3 className="text-sm font-semibold text-fg">
            Revenue trend, last {period} days
          </h3>
          <div className="mt-3 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={d.daySeries}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) =>
                    `${Math.round(v / 1_000_000)}jt`
                  }
                />
                <Tooltip
                  formatter={(v: any) => [formatIDR(Number(v)), "Revenue"]}
                  labelStyle={{ color: "#12151A" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563EB"
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg p-4">
          <h3 className="text-sm font-semibold text-fg">
            Working capital composition
          </h3>
          <div className="mt-3 h-52">
            {pieData.length === 0 ? (
              <p className="pt-16 text-center text-sm text-fg-subtle">
                No open balances.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    stroke="none"
                  >
                    {pieData.map((p, i) => (
                      <Cell key={i} fill={p.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => formatIDR(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 space-y-1">
            {pieData.map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between text-xs"
              >
                <span className="flex items-center gap-2 text-fg-muted">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: p.color }}
                  />
                  {p.name}
                </span>
                <span className="tabular-nums text-fg">
                  {formatIDR(p.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg p-4">
          <h3 className="text-sm font-semibold text-fg">
            Stock value per warehouse
          </h3>
          <div className="mt-3 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.warehouseRows}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="code"
                  tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-fg-subtle)" }}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tickFormatter={(v: number) =>
                    `${Math.round(v / 1_000_000)}jt`
                  }
                />
                <Tooltip
                  formatter={(v: any) => [formatIDR(Number(v)), "Value"]}
                />
                <Bar dataKey="value" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg p-4">
          <h3 className="text-sm font-semibold text-fg">AR aging buckets</h3>
          <div className="mt-3 space-y-2">
            {d.arAging.map((b, i) => {
              const maxAmt = Math.max(...d.arAging.map((x) => x.amount), 1);
              const colors = ["#059669", "#2563EB", "#D97706", "#DC2626"];
              return (
                <div key={b.bucket}>
                  <div className="flex justify-between text-xs">
                    <span className="text-fg-muted">{b.bucket}</span>
                    <span className="tabular-nums text-fg">
                      {formatIDR(b.amount)} · {b.count} inv
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-bg-subtle">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(b.amount / maxAmt) * 100}%`,
                        background: colors[i],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
            Top products by revenue
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Revenue</th>
                <th className="px-4 py-2 text-right">GP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.topProducts.map((p) => (
                <tr key={p.sku} className="hover:bg-bg-subtle/50">
                  <td className="px-4 py-2 font-mono text-xs text-accent">
                    {p.sku}
                  </td>
                  <td className="px-4 py-2 text-fg">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg">
                    {p.qty}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg">
                    {formatIDR(p.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-success">
                    {formatIDR(p.revenue - p.cogs)}
                  </td>
                </tr>
              ))}
              {d.topProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-sm text-fg-subtle"
                  >
                    No outbound movements in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-bg">
          <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-fg">
            Top stock value
          </h3>
          <table className="w-full text-sm">
            <thead className="bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2">SKU</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.topStockRows.map((p) => (
                <tr key={p.sku} className="hover:bg-bg-subtle/50">
                  <td className="px-4 py-2 font-mono text-xs text-accent">
                    {p.sku}
                  </td>
                  <td className="px-4 py-2 text-fg">{p.name}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg">
                    {p.units}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-fg">
                    {formatIDR(p.value)}
                  </td>
                </tr>
              ))}
              {d.topStockRows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-sm text-fg-subtle"
                  >
                    No stock recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SignaturePad
        open={signOpen}
        onClose={() => setSignOpen(false)}
        initialName={window.localStorage.getItem(SIG_NAME_KEY) || meName}
        initialSignature={savedSig}
        onConfirm={handleSigned}
      />
    </div>
  );
}

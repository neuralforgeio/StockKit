export type ReportRow = Record<string, string | number>;

export type ReportData = {
  periodDays: number;
  generatedAt: string;
  totals: {
    inventoryValue: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPct: number;
    ar: number;
    ap: number;
    cashCollected: number;
    cashPaid: number;
    netCash: number;
    netWorking: number;
  };
  counts: {
    warehouses: number;
    skus: number;
    openAR: number;
    openAP: number;
    receipts: number;
    payments: number;
  };
  daySeries: { label: string; revenue: number }[];
  warehouseRows: { code: string; name: string; units: number; value: number }[];
  topStockRows: { sku: string; name: string; units: number; value: number }[];
  topProducts: {
    sku: string;
    name: string;
    qty: number;
    revenue: number;
    cogs: number;
  }[];
  arAging: { bucket: string; count: number; amount: number }[];
  arInvoices: ReportRow[];
  apInvoices: ReportRow[];
  receiptRows: ReportRow[];
  paymentRows: ReportRow[];
};

type Inputs = {
  stock: any[];
  movements: any[];
  products: any[];
  warehouses: any[];
  customerInvoices: any[];
  customerReceipts: any[];
  supplierInvoices: any[];
  payments: any[];
};

const DAY = 86_400_000;

export function computeReport(inp: Inputs, periodDays: number): ReportData {
  const now = Date.now();
  const inPeriod = (ts: string) => {
    const d = Math.floor((now - new Date(ts).getTime()) / DAY);
    return d >= 0 && d < periodDays;
  };

  const sellByProduct = new Map<string, number>();
  const nameByProduct = new Map<string, string>();
  const skuByProduct = new Map<string, string>();
  for (const p of inp.products) {
    sellByProduct.set(p.id, p.default_sell_price_minor);
    nameByProduct.set(p.id, p.name);
    skuByProduct.set(p.id, p.sku);
  }

  const knownStock = inp.stock.filter((s) => nameByProduct.has(s.product_id));
  const inventoryValue = knownStock.reduce(
    (s, x) => s + x.stock_value_minor,
    0,
  );

  const outMov = inp.movements.filter(
    (m) =>
      m.movement_type === "OUT" &&
      nameByProduct.has(m.product_id) &&
      inPeriod(m.created_at),
  );
  const revenue = outMov.reduce(
    (s, m) =>
      s + m.qty * (sellByProduct.get(m.product_id) ?? m.unit_cost_minor),
    0,
  );
  const cogs = outMov.reduce(
    (s, m) => s + (m.cogs_minor ?? m.qty * m.unit_cost_minor),
    0,
  );
  const grossProfit = revenue - cogs;
  const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const daySeries = Array.from({ length: periodDays }, (_, i) => ({
    label: `D-${periodDays - 1 - i}`,
    revenue: 0,
  }));
  for (const m of outMov) {
    const d = Math.floor((now - new Date(m.created_at).getTime()) / DAY);
    daySeries[periodDays - 1 - d].revenue +=
      m.qty * (sellByProduct.get(m.product_id) ?? m.unit_cost_minor);
  }

  const whMap = new Map<
    string,
    { code: string; name: string; units: number; value: number }
  >();
  for (const w of inp.warehouses)
    whMap.set(w.id, { code: w.code, name: w.name, units: 0, value: 0 });
  for (const s of knownStock) {
    const row = whMap.get(s.warehouse_id);
    if (row) {
      row.units += s.on_hand;
      row.value += s.stock_value_minor;
    }
  }
  const warehouseRows = [...whMap.values()];

  const stockByProduct = new Map<string, { units: number; value: number }>();
  for (const s of knownStock) {
    const cur = stockByProduct.get(s.product_id) ?? { units: 0, value: 0 };
    cur.units += s.on_hand;
    cur.value += s.stock_value_minor;
    stockByProduct.set(s.product_id, cur);
  }
  const topStockRows = [...stockByProduct.entries()]
    .map(([id, v]) => ({
      sku: skuByProduct.get(id) ?? "-",
      name: nameByProduct.get(id) ?? "-",
      units: v.units,
      value: v.value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const prodMap = new Map<
    string,
    { sku: string; name: string; qty: number; revenue: number; cogs: number }
  >();
  for (const m of outMov) {
    const cur = prodMap.get(m.product_id) ?? {
      sku: skuByProduct.get(m.product_id) ?? "-",
      name: nameByProduct.get(m.product_id) ?? "-",
      qty: 0,
      revenue: 0,
      cogs: 0,
    };
    cur.qty += m.qty;
    cur.revenue +=
      m.qty * (sellByProduct.get(m.product_id) ?? m.unit_cost_minor);
    cur.cogs += m.cogs_minor ?? m.qty * m.unit_cost_minor;
    prodMap.set(m.product_id, cur);
  }
  const topProducts = [...prodMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const openAR = inp.customerInvoices.filter(
    (i) => i.status !== "paid" && i.status !== "cancelled",
  );
  const openAP = inp.supplierInvoices.filter(
    (i) => i.status !== "paid" && i.status !== "cancelled",
  );
  const ar = openAR.reduce((s, i) => s + (i.total_minor - i.paid_minor), 0);
  const ap = openAP.reduce((s, i) => s + (i.total_minor - i.paid_minor), 0);

  const buckets = [
    { bucket: "0-30 hari", count: 0, amount: 0 },
    { bucket: "31-60 hari", count: 0, amount: 0 },
    { bucket: "61-90 hari", count: 0, amount: 0 },
    { bucket: "> 90 hari", count: 0, amount: 0 },
  ];
  for (const i of openAR) {
    const age = Math.floor((now - new Date(i.invoice_date).getTime()) / DAY);
    const rem = i.total_minor - i.paid_minor;
    const idx = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
    buckets[idx].count += 1;
    buckets[idx].amount += rem;
  }

  const cashCollected = inp.customerReceipts
    .filter((p) => p.status === "completed" && inPeriod(p.created_at))
    .reduce((s, p) => s + p.amount_minor, 0);
  const cashPaid = inp.payments
    .filter((p) => p.status === "completed" && inPeriod(p.created_at))
    .reduce((s, p) => s + p.amount_minor, 0);

  return {
    periodDays,
    generatedAt: new Date().toLocaleString("id-ID"),
    totals: {
      inventoryValue,
      revenue,
      cogs,
      grossProfit,
      marginPct,
      ar,
      ap,
      cashCollected,
      cashPaid,
      netCash: cashCollected - cashPaid,
      netWorking: ar - ap,
    },
    counts: {
      warehouses: inp.warehouses.length,
      skus: inp.products.length,
      openAR: openAR.length,
      openAP: openAP.length,
      receipts: inp.customerReceipts.length,
      payments: inp.payments.length,
    },
    daySeries,
    warehouseRows,
    topStockRows,
    topProducts,
    arAging: buckets,
    arInvoices: openAR.map((i) => ({
      number: i.number,
      party: i.customer_name,
      status: i.status,
      total: i.total_minor,
      paid: i.paid_minor,
      remaining: i.total_minor - i.paid_minor,
      date: new Date(i.invoice_date).toLocaleDateString("id-ID"),
    })),
    apInvoices: openAP.map((i) => ({
      number: i.number,
      party: i.supplier_code,
      status: i.status,
      total: i.total_minor,
      paid: i.paid_minor,
      remaining: i.total_minor - i.paid_minor,
      date: new Date(i.invoice_date).toLocaleDateString("id-ID"),
    })),
    receiptRows: inp.customerReceipts
      .filter((p) => p.status === "completed")
      .map((p) => ({
        number: p.number,
        ref: p.customer_invoice_number,
        account: p.cash_account_name,
        amount: p.amount_minor,
        date: new Date(p.receipt_date).toLocaleDateString("id-ID"),
      })),
    paymentRows: inp.payments
      .filter((p) => p.status === "completed")
      .map((p) => ({
        number: p.number,
        ref: p.supplier_invoice_number,
        account: p.cash_account_name,
        amount: p.amount_minor,
        date: new Date(p.payment_date).toLocaleDateString("id-ID"),
      })),
  };
}

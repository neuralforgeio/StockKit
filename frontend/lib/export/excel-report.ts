import type { ReportData } from "./report-data";

export async function buildFinancialWorkbook(d: ReportData) {
  const mod: any = await import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "StockKit";
  wb.created = new Date();

  const headerFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF1D4ED8" },
  };
  const zebra = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF3F6FA" },
  };
  const thin = { style: "thin" as const, color: { argb: "FFD5DAE2" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const };

  const pageSetup = (ws: any) => {
    ws.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      showGridLines: false,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.6,
        bottom: 0.6,
        header: 0.3,
        footer: 0.3,
      },
    };
  };

  const styleHeaderRow = (ws: any, rowNum: number) => {
    const row = ws.getRow(rowNum);
    row.height = 22;
    row.eachCell((cell: any) => {
      cell.fill = headerFill;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.border = border;
      cell.alignment = center;
    });
  };

  const addSheet = (
    name: string,
    headers: string[],
    rows: (string | number)[][],
    widths: number[],
    moneyCols: number[],
  ) => {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = widths.map((w) => ({ width: w }));
    ws.addRow(headers);
    styleHeaderRow(ws, 1);
    rows.forEach((data, i) => {
      const row = ws.addRow(data);
      row.eachCell((cell: any, col: number) => {
        cell.border = border;
        cell.alignment = {
          vertical: "middle",
          horizontal: moneyCols.includes(col) ? "right" : "left",
        };
        if (i % 2 === 1) cell.fill = zebra;
        if (moneyCols.includes(col)) cell.numFmt = "#,##0";
      });
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
    pageSetup(ws);
    return ws;
  };

  // Summary
  const ws = wb.addWorksheet("Summary", {
    views: [{ state: "frozen", ySplit: 5 }],
  });
  ws.columns = [{ width: 30 }, { width: 22 }, { width: 46 }];
  ws.mergeCells("A1:C1");
  const title = ws.getCell("A1");
  title.value = "StockKit Financial Report";
  title.font = { bold: true, size: 18 };
  title.alignment = center;
  ws.mergeCells("A2:C2");
  const gen = ws.getCell("A2");
  gen.value = `Generated ${d.generatedAt} · Periode ${d.periodDays} hari`;
  gen.font = { italic: true, size: 10, color: { argb: "FF5C6675" } };
  gen.alignment = center;
  ws.getRow(3).height = 6;
  ws.getRow(4).values = ["Metric", "Value (IDR)", "Basis"];
  styleHeaderRow(ws, 4);
  const summary: (string | number)[][] = [
    [
      "Inventory value",
      d.totals.inventoryValue,
      "Stock on hand at current cost",
    ],
    ["Sales revenue", d.totals.revenue, "Goods issued (OUT movements)"],
    ["Cost of goods sold", d.totals.cogs, "COGS posted on delivery"],
    ["Gross profit", d.totals.grossProfit, "Revenue less COGS"],
    [
      "Gross margin",
      `${d.totals.marginPct.toFixed(1)}%`,
      "Gross profit over revenue",
    ],
    [
      "Receivable (AR)",
      d.totals.ar,
      `${d.counts.openAR} open customer invoices`,
    ],
    ["Payable (AP)", d.totals.ap, `${d.counts.openAP} open supplier invoices`],
    ["Net working position", d.totals.netWorking, "AR less AP"],
    ["Cash collected", d.totals.cashCollected, "Completed customer receipts"],
    ["Cash paid", d.totals.cashPaid, "Completed supplier payments"],
    ["Net cash flow", d.totals.netCash, "Collected less paid"],
  ];
  summary.forEach((data, i) => {
    const row = ws.addRow(data);
    row.height = 18;
    row.eachCell((cell: any, col: number) => {
      cell.border = border;
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 2 ? "right" : "left",
      };
      if (i % 2 === 1) cell.fill = zebra;
      if (col === 2 && typeof data[1] === "number") cell.numFmt = "#,##0";
    });
  });
  pageSetup(ws);

  addSheet(
    "Warehouse Stock",
    ["Code", "Warehouse", "Units", "Value (IDR)"],
    d.warehouseRows.map((w) => [w.code, w.name, w.units, w.value]),
    [12, 34, 12, 20],
    [4],
  );

  addSheet(
    "Top Products",
    ["SKU", "Product", "Qty out", "Revenue", "COGS", "Gross profit"],
    d.topProducts.map((p) => [
      p.sku,
      p.name,
      p.qty,
      p.revenue,
      p.cogs,
      p.revenue - p.cogs,
    ]),
    [14, 32, 10, 18, 18, 18],
    [4, 5, 6],
  );

  addSheet(
    "AR Aging",
    ["Bucket", "Invoices", "Open amount"],
    d.arAging.map((b) => [b.bucket, b.count, b.amount]),
    [16, 12, 20],
    [3],
  );

  addSheet(
    "Customer Invoices",
    ["Number", "Customer", "Status", "Total", "Paid", "Remaining", "Date"],
    d.arInvoices.map((i) => [
      i.number,
      i.party,
      i.status,
      i.total,
      i.paid,
      i.remaining,
      i.date,
    ]),
    [14, 30, 12, 16, 16, 16, 12],
    [4, 5, 6],
  );

  addSheet(
    "Supplier Invoices",
    ["Number", "Supplier", "Status", "Total", "Paid", "Remaining", "Date"],
    d.apInvoices.map((i) => [
      i.number,
      i.party,
      i.status,
      i.total,
      i.paid,
      i.remaining,
      i.date,
    ]),
    [14, 20, 12, 16, 16, 16, 12],
    [4, 5, 6],
  );

  addSheet(
    "Receipts & Payments",
    ["Type", "Number", "Reference", "Account", "Amount", "Date"],
    [
      ...d.receiptRows.map((p) => [
        "Receipt",
        p.number,
        p.ref,
        p.account,
        p.amount,
        p.date,
      ]),
      ...d.paymentRows.map((p) => [
        "Payment",
        p.number,
        p.ref,
        p.account,
        -p.amount,
        p.date,
      ]),
    ],
    [10, 14, 16, 24, 16, 12],
    [5],
  );

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `StockKit-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

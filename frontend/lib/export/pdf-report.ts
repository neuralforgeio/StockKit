import type { ReportData } from "./report-data";

export type ReportSigner = { name: string; signature: string | null };

const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

const rpCompact = (n: number) => {
  if (n >= 1_000_000_000)
    return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (n >= 1_000_000)
    return `Rp ${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (n >= 1_000)
    return `Rp ${(n / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp ${n}`;
};

type Toc = Record<string, number> | null;

const SECTIONS: [string, string][] = [
  ["1", "Ringkasan Eksekutif"],
  ["2", "Analisis Persediaan"],
  ["3", "Kinerja Penjualan & Harga Pokok"],
  ["4", "Piutang, Utang & Modal Kerja"],
  ["5", "Arus Kas"],
  ["6", "Lampiran: Metodologi & Pengesahan"],
];

async function render(
  d: ReportData,
  toc: Toc,
  signer: ReportSigner,
): Promise<Record<string, number>> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 16;
  const CW = W - M * 2;
  const pages: Record<string, number> = {};
  let y = 0;
  let currentSection = "Sampul";

  const periodLabel = () =>
    d.periodDays === 7
      ? "7 hari terakhir"
      : d.periodDays === 30
        ? "30 hari terakhir"
        : "90 hari terakhir";

  const pageHeader = () => {
    doc.setFillColor(29, 78, 216);
    doc.rect(0, 0, W, 16, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    doc.text("StockKit · Laporan Keuangan & Operasional", M, 10);
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    doc.text(currentSection, W - M, 10, { align: "right" });
    doc.setTextColor(20, 24, 31);
  };

  const flow = (need: number) => {
    if (y + need > 272) {
      doc.addPage();
      pageHeader();
      y = 24;
    }
  };

  const heading = (num: string, title: string) => {
    doc.addPage();
    currentSection = title;
    pageHeader();
    y = 28;
    pages[`${num}|${title}`] = doc.getNumberOfPages();
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(16, 24, 40);
    doc.text(`${num}   ${title}`, M, y);
    y += 2.4;
    doc.setDrawColor(29, 78, 216);
    doc.setLineWidth(0.9);
    doc.line(M, y, M + 46, y);
    doc.setLineWidth(0.2);
    y += 7;
    doc.setTextColor(20, 24, 31);
  };

  const para = (txt: string) => {
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(txt, CW) as string[];
    const h = lines.length * 4.9 + 2.5;
    flow(h);
    doc.text(txt, M, y, {
      maxWidth: CW,
      align: "justify",
      lineHeightFactor: 1.32,
    });
    y += h;
  };

  const table = (
    head: string[],
    body: string[][],
    fill: [number, number, number] = [29, 78, 216],
    cols: Record<number, any> = {},
  ) => {
    flow(34);
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "grid",
      headStyles: {
        fillColor: fill,
        textColor: 255,
        font: "times",
        fontStyle: "bold",
        halign: "center",
        fontSize: 9,
      },
      bodyStyles: { font: "times", fontSize: 9 },
      alternateRowStyles: { fillColor: [243, 246, 250] },
      columnStyles: cols,
      styles: { cellPadding: 2.1, lineColor: [210, 214, 222], lineWidth: 0.15 },
      margin: { left: M, right: M },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  const barChart = (series: number[], caption: string) => {
    const h = 46;
    flow(h + 18);
    const max = Math.max(...series, 0);
    const hasData = max > 0;
    const x0 = M + 12;
    const x1 = M + CW;
    const y0 = y;
    const y1 = y + h;

    doc.setDrawColor(190, 196, 206);
    doc.setLineWidth(0.25);
    doc.rect(x0, y0, x1 - x0, h);

    doc.setFont("times", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 138, 150);
    for (let g = 1; g <= 3; g++) {
      const gy = y1 - (h * g) / 4;
      doc.setDrawColor(228, 232, 238);
      doc.setLineWidth(0.15);
      doc.line(x0, gy, x1, gy);
      doc.text(rpCompact(hasData ? (max * g) / 4 : 0), x0 - 1.5, gy + 1, {
        align: "right",
      });
    }
    doc.text("0", x0 - 1.5, y1 + 1, { align: "right" });

    if (hasData) {
      const bw = (x1 - x0) / series.length;
      series.forEach((v, i) => {
        const bh = (v / max) * (h - 4);
        if (bh > 0.2) {
          doc.setFillColor(i % 2 === 0 ? 37 : 96, i % 2 === 0 ? 99 : 124, 235);
          doc.rect(x0 + i * bw + 0.4, y1 - bh, bw - 0.8, bh, "F");
        }
      });
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140, 148, 160);
      doc.text(
        "Tidak ada pergerakan penjualan pada periode ini",
        (x0 + x1) / 2,
        y0 + h / 2,
        { align: "center" },
      );
    }

    doc.setFont("times", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 138, 150);
    doc.text(`D-${series.length - 1}`, x0, y1 + 4);
    doc.text("hari ini", x1, y1 + 4, { align: "right" });
    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(92, 102, 117);
    doc.text(
      `${caption} · puncak ${hasData ? rpCompact(max) : "Rp 0"}`,
      x0,
      y1 + 8.5,
    );
    doc.setTextColor(20, 24, 31);
    y = y1 + 13;
  };

  // ---------- Halaman 1: Sampul + Daftar Isi ----------
  doc.setFillColor(29, 78, 216);
  doc.rect(0, 0, W, 74, "F");
  doc.setFillColor(23, 37, 84);
  doc.rect(0, 74, W, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("times", "bold");
  doc.setFontSize(26);
  doc.text("Laporan Keuangan", M, 34);
  doc.text("& Operasional", M, 46);
  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.text("PT Sinar Mitra Teknologi · StockKit Workspace", M, 58);
  doc.setTextColor(20, 24, 31);
  y = 92;

  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  doc.text(
    `Dokumen ini disusun otomatis oleh StockKit pada ${d.generatedAt} dari data transaksional terkini, mencakup periode ${periodLabel()}. Seluruh nilai dinyatakan dalam Rupiah Indonesia dan merefleksikan pergerakan stok tertagih, faktur terbit, serta kas tercatat hingga waktu pembentukan laporan.`,
    M,
    y,
    { maxWidth: CW, align: "justify", lineHeightFactor: 1.35 },
  );
  y += 26;

  table(
    ["Parameter", "Keterangan"],
    [
      ["Entitas", "PT Sinar Mitra Teknologi"],
      ["Periode analisis", periodLabel()],
      ["Mata uang", "IDR (Rupiah)"],
      [
        "Sumber data",
        "Inventory movements, sales orders, invoices, receipts, payments",
      ],
      ["Tanggal pembentukan", d.generatedAt],
      ["Penandatangan", signer.name || "-"],
      ["Klasifikasi", "Internal · Confidential"],
    ],
    [16, 24, 40],
    { 0: { fontStyle: "bold", cellWidth: 55 } },
  );

  flow(64);
  doc.setFont("times", "bold");
  doc.setFontSize(12.5);
  doc.text("Daftar Isi", M, y);
  y += 7;
  doc.setFont("times", "normal");
  doc.setFontSize(10.5);
  for (const [num, title] of SECTIONS) {
    const key = `${num}|${title}`;
    const page = toc ? String(toc[key] ?? "-") : "·";
    doc.text(`${num}   ${title}`, M + 2, y);
    doc.setDrawColor(170, 176, 188);
    doc.setLineDashPattern([1, 1.5], 0);
    doc.line(M + 8, y + 1, W - M - 12, y + 1);
    doc.setLineDashPattern([], 0);
    doc.text(page, W - M, y, { align: "right" });
    y += 7;
  }

  // ---------- Bab 1 ----------
  heading("1", "Ringkasan Eksekutif");
  para(
    `Pada periode ${periodLabel()}, Perusahaan mencatat nilai persediaan sebesar ${fmt(d.totals.inventoryValue)} yang tersebar pada ${d.counts.warehouses} gudang aktif dengan ${d.counts.skus} SKU terdaftar. Pendapatan penjualan yang diakui dari pergerakan barang keluar mencapai ${fmt(d.totals.revenue)}, disertai harga pokok penjualan ${fmt(d.totals.cogs)}, sehingga laba kotor terbentuk ${fmt(d.totals.grossProfit)} atau setara margin ${pct(d.totals.marginPct)}.`,
  );
  para(
    `Posisi modal kerja menunjukkan piutang usaha ${fmt(d.totals.ar)} dari ${d.counts.openAR} faktur pelanggan terbuka, berbanding utang usaha ${fmt(d.totals.ap)} dari ${d.counts.openAP} faktur pemasok terbuka. Selisih keduanya menghasilkan modal kerja bersih ${fmt(d.totals.netWorking)}, yang menjadi bantalan likuiditas jangka pendek Perusahaan.`,
  );
  para(
    `Arus kas periode berjalan mencatat penerimaan ${fmt(d.totals.cashCollected)} dan pengeluaran ${fmt(d.totals.cashPaid)}, menghasilkan arus kas bersih ${fmt(d.totals.netCash)}. Manajemen disarankan memprioritaskan penagihan pada bucket aging tertua sebagaimana diuraikan pada bab keempat laporan ini.`,
  );
  table(
    ["Indikator", "Nilai", "Keterangan"],
    [
      [
        "Nilai persediaan",
        fmt(d.totals.inventoryValue),
        "Stok on-hand pada biaya berjalan",
      ],
      [
        "Pendapatan penjualan",
        fmt(d.totals.revenue),
        "Barang keluar periode berjalan",
      ],
      [
        "Harga pokok penjualan",
        fmt(d.totals.cogs),
        "COGS tertagih pada delivery",
      ],
      [
        "Laba kotor",
        fmt(d.totals.grossProfit),
        `Margin ${pct(d.totals.marginPct)}`,
      ],
      [
        "Piutang usaha (AR)",
        fmt(d.totals.ar),
        `${d.counts.openAR} faktur terbuka`,
      ],
      [
        "Utang usaha (AP)",
        fmt(d.totals.ap),
        `${d.counts.openAP} faktur terbuka`,
      ],
      ["Modal kerja bersih", fmt(d.totals.netWorking), "AR dikurangi AP"],
      [
        "Arus kas bersih",
        fmt(d.totals.netCash),
        "Penerimaan dikurangi pembayaran",
      ],
    ],
    [29, 78, 216],
    {
      1: { halign: "right" },
      2: { fontStyle: "italic", textColor: [92, 102, 117] },
    },
  );

  // ---------- Bab 2 ----------
  heading("2", "Analisis Persediaan");
  para(
    `Persediaan merupakan komponen terbesar aset lancar Perusahaan. Distribusi nilai antar gudang berikut memberikan gambaran konsentrasi stok, sehingga keputusan replenishment dan transfer antar lokasi dapat diambil berbasis data, bukan perkiraan. Gudang dengan nilai tertinggi warrant pengawasan siklus perhitungan (cycle count) yang lebih ketat.`,
  );
  table(
    ["Gudang", "Nama", "Unit on-hand", "Nilai (IDR)"],
    d.warehouseRows.map((w) => [w.code, w.name, String(w.units), fmt(w.value)]),
    [16, 24, 40],
    { 2: { halign: "right" }, 3: { halign: "right" } },
  );
  para(
    `Konsentrasi nilai persediaan pada SKU teratas ditampilkan berikut. SKU bernilai tinggi dengan perputaran rendah merupakan kandidat utama tinjauan harga atau program promosi guna melepaskan modal yang mengendap.`,
  );
  table(
    ["SKU", "Produk", "Unit", "Nilai (IDR)"],
    d.topStockRows.map((p) => [p.sku, p.name, String(p.units), fmt(p.value)]),
    [16, 24, 40],
    { 2: { halign: "right" }, 3: { halign: "right" } },
  );

  // ---------- Bab 3 ----------
  heading("3", "Kinerja Penjualan & Harga Pokok");
  para(
    `Grafik berikut memetakan pendapatan harian sepanjang periode analisis. Pola puncak dan lembah memberikan indikasi seasonality mingguan yang dapat dimanfaatkan untuk penjadwalan pembelian dan penempatan staf gudang.`,
  );
  barChart(
    d.daySeries.map((x) => x.revenue),
    "Pendapatan harian (IDR)",
  );
  para(
    `Kontributor pendapatan terbesar disajikan pada tabel berikut beserta beban pokoknya. Selisih antara keduanya merupakan laba kotor per produk, dasar penetapan prioritas penjualan dan negosiasi harga pemasok.`,
  );
  table(
    ["SKU", "Produk", "Qty", "Pendapatan", "COGS", "Laba kotor"],
    d.topProducts.map((p) => [
      p.sku,
      p.name,
      String(p.qty),
      fmt(p.revenue),
      fmt(p.cogs),
      fmt(p.revenue - p.cogs),
    ]),
    [5, 128, 61],
    {
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  );
  if (d.topProducts.length === 0) {
    para(
      `Belum terdapat pergerakan barang keluar pada periode ini, sehingga tabel kontributor pendapatan kosong. Setelah proses delivery sales order pertama dijalankan, bagian ini akan terisi otomatis dari pergerakan OUT beserta COGS yang diposting.`,
    );
  }

  // ---------- Bab 4 ----------
  heading("4", "Piutang, Utang & Modal Kerja");
  para(
    `Aging piutang berikut mengelompokkan faktur terbuka berdasarkan umur sejak tanggal faktur. Bucket tertua merepresentasikan risiko penagihan tertinggi dan seharusnya menjadi fokus tindakan kolektif tim finance minggu ini.`,
  );
  table(
    ["Bucket umur", "Jumlah faktur", "Nilai terbuka (IDR)"],
    d.arAging.map((b) => [b.bucket, String(b.count), fmt(b.amount)]),
    [21, 128, 61],
    { 1: { halign: "center" }, 2: { halign: "right" } },
  );
  para(`Rincian faktur piutang terbuka:`);
  table(
    ["Faktur", "Pelanggan", "Status", "Total", "Terbayar", "Sisa"],
    d.arInvoices
      .slice(0, 10)
      .map((i) => [
        String(i.number),
        String(i.party),
        String(i.status),
        fmt(Number(i.total)),
        fmt(Number(i.paid)),
        fmt(Number(i.remaining)),
      ]),
    [21, 128, 61],
    { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  );
  para(`Rincian faktur utang terbuka kepada pemasok:`);
  table(
    ["Faktur", "Pemasok", "Status", "Total", "Terbayar", "Sisa"],
    d.apInvoices
      .slice(0, 10)
      .map((i) => [
        String(i.number),
        String(i.party),
        String(i.status),
        fmt(Number(i.total)),
        fmt(Number(i.paid)),
        fmt(Number(i.remaining)),
      ]),
    [180, 83, 9],
    { 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  );

  // ---------- Bab 5 ----------
  heading("5", "Arus Kas");
  para(
    `Penerimaan kas dari pelanggan dan pembayaran kepada pemasok pada periode berjalan dirangkum berikut. Selisih keduanya menentukan kemampuan Perusahaan mendanai operasi tanpa pembiayaan eksternal.`,
  );
  table(
    ["Bukti", "Referensi", "Akun kas", "Nilai (IDR)", "Tanggal"],
    d.receiptRows
      .slice(0, 10)
      .map((p) => [
        String(p.number),
        String(p.ref),
        String(p.account),
        fmt(Number(p.amount)),
        String(p.date),
      ]),
    [21, 128, 61],
    { 3: { halign: "right" } },
  );
  table(
    ["Bukti", "Referensi", "Akun kas", "Nilai (IDR)", "Tanggal"],
    d.paymentRows
      .slice(0, 10)
      .map((p) => [
        String(p.number),
        String(p.ref),
        String(p.account),
        fmt(Number(p.amount)),
        String(p.date),
      ]),
    [180, 83, 9],
    { 3: { halign: "right" } },
  );
  para(
    `Arus kas bersih periode berjalan adalah ${fmt(d.totals.netCash)}. Bila bernilai negatif, penjadwalan pembayaran pemasok perlu diselaraskan dengan siklus penagihan piutang agar likuiditas tetap terjaga tanpa mengorbankan hubungan pemasok.`,
  );

  // ---------- Bab 6 ----------
  heading("6", "Lampiran: Metodologi & Pengesahan");
  para(`Metodologi perhitungan yang diterapkan pada laporan ini:`);
  const notes = [
    "Nilai persediaan dihitung dari stock_levels on-hand dikalikan biaya rata-rata (average) atau lapisan FIFO sesuai metode biaya tiap produk.",
    "Pendapatan penjualan direkonstruksi dari pergerakan OUT pada inventory_movements dikalikan harga jual default produk pada saat laporan dibentuk.",
    "COGS diambil dari kolom cogs_minor pergerakan OUT, yang diposting saat delivery menggunakan average cost atau deplesi lapisan FIFO.",
    "Aging piutang dihitung dari selisih hari antara tanggal laporan dan tanggal faktur untuk faktur berstatus terbuka.",
    "Arus kas hanya mengakui bukti berstatus completed; bukti yang dibatalkan dikecualikan secara penuh.",
  ];
  notes.forEach((line, i) => {
    const lines = doc.splitTextToSize(line, CW - 10) as string[];
    const h = lines.length * 4.6 + 2;
    flow(h);
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.text(`${i + 1}.`, M + 2, y);
    doc.text(line, M + 8, y, { maxWidth: CW - 10 });
    y += h;
  });

  // ---------- Blok pengesahan: pinned di bawah halaman, di atas footer ----------
  if (y > 224) {
    doc.addPage();
    pageHeader();
  }
  y = 236;
  const colW = CW / 3;
  const lineY = y + 26;
  const labels = ["Disiapkan oleh", "Diperiksa oleh", "Disetujui oleh"];
  for (let i = 0; i < 3; i++) {
    const cx = M + i * colW + colW / 2;
    doc.setFont("times", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 24, 31);
    doc.text(labels[i], cx, y, { align: "center" });

    if (i === 0 && signer.signature) {
      try {
        const props = doc.getImageProperties(signer.signature);
        const maxW = 52;
        const maxH = 20;
        const ratio = Math.min(maxW / props.width, maxH / props.height);
        const w = props.width * ratio;
        const h = props.height * ratio;
        doc.addImage(signer.signature, "PNG", cx - w / 2, y + 3, w, h);
      } catch {
        // signature image corrupt: fall through to blank line
      }
    }

    doc.setDrawColor(120, 128, 143);
    doc.setLineWidth(0.3);
    doc.line(cx - 28, lineY, cx + 28, lineY);

    if (i === 0) {
      doc.setFont("times", "bold");
      doc.setFontSize(9.5);
      doc.text(
        signer.name || "( ............................ )",
        cx,
        lineY + 5,
        { align: "center" },
      );
      doc.setFont("times", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 118, 132);
      doc.text(`Ditandatangani digital · ${d.generatedAt}`, cx, lineY + 9.5, {
        align: "center",
      });
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(9);
      doc.text("( ............................ )", cx, lineY + 5, {
        align: "center",
      });
    }
  }
  doc.setTextColor(20, 24, 31);

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("times", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 128, 143);
    doc.text("StockKit · dokumen internal rahasia", M, 290);
    doc.text(`Halaman ${i} dari ${total}`, W - M, 290, { align: "right" });
  }

  if (toc !== null) {
    doc.save(`StockKit-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
  return pages;
}

export async function buildFinancialReport(
  d: ReportData,
  signer: ReportSigner,
) {
  const pages = await render(d, null, signer);
  await render(d, pages, signer);
}

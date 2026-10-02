"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  DetailDrawer,
  DrawerFacts,
  DrawerSection,
} from "@/components/ui/detail-drawer";
import { KpiCard } from "@/components/ui/kpi-card";
import { Modal, ModalIcon } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Sparkline } from "@/components/ui/sparkline";
import { Field, inputClass } from "@/components/ui/form-helpers";
import { useToast } from "@/components/ui/toast";
import { listCategories, type Category } from "@/lib/api/categories";
import {
  listMovements,
  listStockLevels,
  type Movement,
  type StockLevel,
} from "@/lib/api/inventory";
import {
  createProduct,
  deleteProduct,
  deleteProductImage,
  getNextSKU,
  imageContentUrl,
  listProductImages,
  listProducts,
  setPrimaryProductImage,
  updateProduct,
  uploadProductImage,
  type Product,
  type ProductImageMeta,
} from "@/lib/api/products";
import { listUnits, type Unit } from "@/lib/api/units";
import { fuzzyMatch } from "@/lib/fuzzy";
import { formatIDR } from "@/lib/format";

const MAX_IMAGES = 8;

function stockStatus(onHand: number, minStock: number) {
  if (onHand <= 0)
    return { label: "Out of Stock", cls: "bg-danger/10 text-danger" };
  if (onHand < minStock)
    return { label: "Low Stock", cls: "bg-warning/10 text-warning" };
  return { label: "In Stock", cls: "bg-success/10 text-success" };
}

function marginPct(sell: number, buy: number): number | null {
  if (buy <= 0) return null;
  return ((sell - buy) / buy) * 100;
}

type StagedImage = { key: string; dataUrl: string; mime: string };

export default function ProductsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [open, setOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [deleteImageTarget, setDeleteImageTarget] =
    useState<ProductImageMeta | null>(null);

  const [images, setImages] = useState<ProductImageMeta[]>([]);
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState({
    sku: "",
    name: "",
    type: "product" as "product" | "service",
    unit_id: "",
    category_id: "",
    cost_method: "average" as "average" | "fifo",
    sell: 0,
    buy: 0,
    min_stock: "0",
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [page, stockLevels, movs, unitList, catList] = await Promise.all([
        listProducts(undefined, 100),
        listStockLevels(),
        listMovements({ limit: 200 }),
        listUnits(),
        listCategories(),
      ]);
      setItems(page.data);
      setStock(stockLevels);
      setMovements(movs.data);
      setUnits(unitList);
      setCategories(catList);
    } catch (err: any) {
      toast.error("Load failed", err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const stockByProduct = useMemo(() => {
    const map = new Map<string, { onHand: number; value: number }>();
    for (const s of stock) {
      const cur = map.get(s.product_id) ?? { onHand: 0, value: 0 };
      cur.onHand += s.on_hand;
      cur.value += s.stock_value_minor;
      map.set(s.product_id, cur);
    }
    return map;
  }, [stock]);

  const kpis = useMemo(() => {
    const totalValue = stock.reduce((s, x) => s + x.stock_value_minor, 0);
    const activeSkus = items.filter((p) => p.active).length;
    const lowStock = items.filter(
      (p) => (stockByProduct.get(p.id)?.onHand ?? 0) < p.min_stock,
    ).length;
    const margins = items
      .map((p) =>
        marginPct(p.default_sell_price_minor, p.default_buy_price_minor),
      )
      .filter((m): m is number => m !== null);
    const avgMargin = margins.length
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : 0;
    const profitByDay = Array.from({ length: 30 }, () => 0);
    const byId = new Map(items.map((p) => [p.id, p]));
    const now = Date.now();
    for (const m of movements) {
      if (m.movement_type !== "OUT") continue;
      const p = byId.get(m.product_id);
      if (!p) continue;
      const d = Math.floor((now - new Date(m.created_at).getTime()) / 86400000);
      if (d >= 0 && d < 30)
        profitByDay[29 - d] +=
          m.qty * (p.default_sell_price_minor - p.default_buy_price_minor);
    }
    return { totalValue, activeSkus, lowStock, avgMargin, profitByDay };
  }, [items, stock, movements, stockByProduct]);

  const filtered = useMemo(
    () => items.filter((p) => fuzzyMatch(query, [p.sku, p.name, p.type])),
    [items, query],
  );

  const selectedMovements = useMemo(
    () => movements.filter((m) => m.product_id === selected?.id).slice(0, 8),
    [movements, selected],
  );
  const selectedSeries = useMemo(() => {
    if (!selected) return [];
    return movements
      .filter((m) => m.product_id === selected.id)
      .sort((a, b) => a.movement_seq - b.movement_seq)
      .map((m) => m.balance_after);
  }, [movements, selected]);

  const openCreate = () => {
    setEditTarget(null);
    setImages([]);
    setStaged([]);
    setDraft({
      sku: "",
      name: "",
      type: "product",
      unit_id: units[0]?.id ?? "",
      category_id: "",
      cost_method: "average",
      sell: 0,
      buy: 0,
      min_stock: "0",
    });
    setOpen(true);
    getNextSKU()
      .then((sku) => setDraft((d) => (d.sku === "" ? { ...d, sku } : d)))
      .catch(() => undefined);
  };

  const openEdit = async (p: Product) => {
    setEditTarget(p);
    setStaged([]);
    setDraft({
      sku: p.sku,
      name: p.name,
      type: p.type as "product" | "service",
      unit_id: p.unit_id,
      category_id: p.category_id ?? "",
      cost_method: p.cost_method as "average" | "fifo",
      sell: p.default_sell_price_minor,
      buy: p.default_buy_price_minor,
      min_stock: String(p.min_stock),
    });
    setOpen(true);
    try {
      setImages(await listProductImages(p.id));
    } catch {
      setImages([]);
    }
  };

  const readFiles = async (files: FileList): Promise<StagedImage[]> => {
    const out: StagedImage[] = [];
    for (const file of Array.from(files)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        toast.warning(
          "Unsupported image skipped",
          `${file.name}: use PNG, JPEG, or WebP.`,
        );
        continue;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.warning("Image too large", `${file.name}: maximum 2 MB.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Read failed"));
        reader.readAsDataURL(file);
      });
      const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
      out.push({ key: `${Date.now()}-${file.name}`, dataUrl, mime });
    }
    return out;
  };

  const handleAddToEdit = async (files: FileList) => {
    if (!editTarget) return;
    setUploading(true);
    try {
      const prepared = await readFiles(files);
      for (const s of prepared) {
        await uploadProductImage(
          editTarget.id,
          s.mime,
          s.dataUrl.split(",")[1],
        );
      }
      setImages(await listProductImages(editTarget.id));
      toast.success(
        "Images uploaded",
        `${prepared.length} image(s) attached to ${editTarget.sku}.`,
      );
      load();
    } catch (err: any) {
      toast.error("Upload failed", err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleSetPrimary = async (img: ProductImageMeta) => {
    if (!editTarget) return;
    try {
      await setPrimaryProductImage(img.id, editTarget.id);
      setImages(await listProductImages(editTarget.id));
      toast.success(
        "Thumbnail updated",
        "This image now represents the product in lists.",
      );
      load();
    } catch (err: any) {
      toast.error("Update failed", err.message);
    }
  };

  const handleDeleteImage = async () => {
    if (!deleteImageTarget || !editTarget) return;
    try {
      await deleteProductImage(deleteImageTarget.id);
      setImages(await listProductImages(editTarget.id));
      setDeleteImageTarget(null);
      toast.success("Image removed", "The gallery was updated.");
      load();
    } catch (err: any) {
      toast.error("Delete failed", err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      sku: draft.sku.trim(),
      name: draft.name.trim(),
      unit_id: draft.unit_id,
      type: draft.type,
      category_id: draft.category_id || null,
      cost_method: draft.cost_method,
      default_sell_price_minor: draft.sell,
      default_buy_price_minor: draft.buy,
      min_stock: Math.max(0, Number(draft.min_stock) || 0),
    };
    try {
      if (editTarget) {
        const updated = await updateProduct(editTarget.id, payload);
        setItems((prev) =>
          prev.map((x) => (x.id === editTarget.id ? updated : x)),
        );
        toast.success(`Updated ${updated.sku}`, "Product changes saved.");
      } else {
        const created = await createProduct(payload);
        setItems((prev) => [created, ...prev]);
        toast.success(
          `Created ${created.sku}`,
          `${created.name} added to the catalog.`,
        );
        if (staged.length > 0) {
          setUploading(true);
          for (const s of staged) {
            await uploadProductImage(
              created.id,
              s.mime,
              s.dataUrl.split(",")[1],
            );
          }
          setUploading(false);
          toast.success(
            "Images uploaded",
            `${staged.length} image(s) attached to ${created.sku}.`,
          );
        }
      }
      setOpen(false);
      setEditTarget(null);
      setStaged([]);
      load();
    } catch (err: any) {
      toast.error("Save failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      setItems((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(
        `Deleted ${deleteTarget.sku}`,
        "The product was removed from the active catalog.",
      );
    } catch (err: any) {
      toast.error("Delete failed", err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Total Stock Value"
          value={formatIDR(kpis.totalValue)}
          sub={formatIDR(kpis.totalValue)}
        />
        <KpiCard
          label="Active SKUs"
          value={`${kpis.activeSkus} Active SKUs`}
          sub={`${items.length} total products`}
        />
        <KpiCard
          label="Low Stock Items"
          value={`${kpis.lowStock} Items`}
          sub={
            kpis.lowStock === 0
              ? "All items above minimum"
              : "Below minimum stock"
          }
          icon={
            kpis.lowStock === 0 ? (
              <span className="rounded-full bg-success/10 p-1 text-success">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            ) : (
              <span className="rounded-full bg-warning/10 p-1 text-warning">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </span>
            )
          }
        />
        <KpiCard
          label="Avg. Profit Margin"
          value={`${kpis.avgMargin.toFixed(1)}%`}
          sub="Estimated from goods out"
          spark={kpis.profitByDay}
          sparkTone="success"
        />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Products</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Comprehensive product catalog.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search SKU or name"
          />
          <Button onClick={openCreate}>Create product</Button>
        </div>
      </header>

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg p-10 text-center text-sm text-fg-muted">
          No products match this view yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5 text-right">Stock on Hand</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 text-right">Sell Price</th>
                <th className="px-4 py-2.5 text-right">Buy Price</th>
                <th className="px-4 py-2.5 text-right">Margin %</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => {
                const onHand = stockByProduct.get(p.id)?.onHand ?? 0;
                const st = stockStatus(onHand, p.min_stock);
                const margin = marginPct(
                  p.default_sell_price_minor,
                  p.default_buy_price_minor,
                );
                return (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="cursor-pointer transition-colors hover:bg-bg-subtle/60"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-bg-subtle">
                          {p.primary_image_id ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageContentUrl(p.primary_image_id)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                aria-hidden
                              >
                                <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <span className="font-medium text-fg">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-accent">
                      {p.sku}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {onHand} Units
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {formatIDR(p.default_sell_price_minor)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                      {formatIDR(p.default_buy_price_minor)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {margin === null ? "—" : `${margin.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-2.5">
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          aria-label={`Edit ${p.sku}`}
                          onClick={() => openEdit(p)}
                          className="rounded-md p-1.5 text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden
                          >
                            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          </svg>
                        </button>
                        <button
                          aria-label={`Delete ${p.sku}`}
                          onClick={() => setDeleteTarget(p)}
                          className="rounded-md p-1.5 text-fg-subtle hover:bg-danger/10 hover:text-danger"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden
                          >
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
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
        open={selected !== null}
        onClose={() => setSelected(null)}
        eyebrow="Product detail"
        title={selected ? `${selected.name} (${selected.sku})` : ""}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-subtle">
                {selected.primary_image_id ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageContentUrl(selected.primary_image_id)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden
                    >
                      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-fg">{selected.name}</p>
                <p className="font-mono text-xs text-accent">{selected.sku}</p>
                <p className="mt-1 text-xs text-fg-muted">
                  {selected.type} ·{" "}
                  {units.find((u) => u.id === selected.unit_id)?.code ?? "—"} ·{" "}
                  {categories.find((c) => c.id === selected.category_id)
                    ?.name ?? "No category"}
                </p>
              </div>
            </div>
            <DrawerSection label="Specifications">
              <DrawerFacts
                items={[
                  [
                    "Cost method",
                    selected.cost_method === "fifo" ? "FIFO" : "Moving average",
                  ],
                  ["Sell price", formatIDR(selected.default_sell_price_minor)],
                  ["Buy price", formatIDR(selected.default_buy_price_minor)],
                  ["Min stock", String(selected.min_stock)],
                ]}
              />
            </DrawerSection>
            <DrawerSection label="Stock movement, last 30 days">
              {selectedSeries.length >= 2 ? (
                <div className="rounded-lg border border-border bg-bg-subtle/50 p-3">
                  <Sparkline
                    values={selectedSeries}
                    tone="accent"
                    height={56}
                  />
                </div>
              ) : (
                <p className="text-sm text-fg-muted">
                  No movements recorded for this product.
                </p>
              )}
            </DrawerSection>
            <DrawerSection label="Stock per warehouse">
              <div className="space-y-2">
                {stock
                  .filter((s) => s.product_id === selected.id)
                  .map((s) => (
                    <div
                      key={s.warehouse_id}
                      className="flex items-center justify-between rounded-lg border border-border bg-bg-subtle/50 px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-xs text-fg">
                        {s.warehouse_code}
                      </span>
                      <span className="tabular-nums text-fg">
                        {s.on_hand} units
                      </span>
                      <span className="tabular-nums text-fg-muted">
                        {formatIDR(s.stock_value_minor)}
                      </span>
                    </div>
                  ))}
                {stock.filter((s) => s.product_id === selected.id).length ===
                  0 && (
                  <p className="text-sm text-fg-muted">
                    No stock recorded yet.
                  </p>
                )}
              </div>
            </DrawerSection>
            <DrawerSection label="Transactional log">
              <div className="space-y-2">
                {selectedMovements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-fg">
                        <span
                          className={
                            m.movement_type.includes("IN")
                              ? "text-success"
                              : "text-danger"
                          }
                        >
                          {m.movement_type}
                        </span>{" "}
                        {m.qty} units
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {new Date(m.created_at).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <span className="tabular-nums text-fg-muted">
                      bal {m.balance_after}
                    </span>
                  </div>
                ))}
                {selectedMovements.length === 0 && (
                  <p className="text-sm text-fg-muted">No movements yet.</p>
                )}
              </div>
            </DrawerSection>
          </div>
        )}
      </DetailDrawer>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setEditTarget(null);
          setStaged([]);
        }}
        title={editTarget ? `Edit ${editTarget.sku}` : "Create product"}
        description={
          editTarget
            ? "Manage images, prices, and classification. Changes apply to new documents."
            : "SKU is prefilled by the system and stays editable."
        }
        icon={
          <ModalIcon path="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="SKU" required>
              <input
                value={draft.sku}
                onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                className={inputClass("font-mono")}
                required
              />
            </Field>
            <Field label="Name" required>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={inputClass()}
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    type: e.target.value as "product" | "service",
                  })
                }
                className={inputClass()}
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>
            </Field>
            <Field label="Unit" required>
              <select
                value={draft.unit_id}
                onChange={(e) =>
                  setDraft({ ...draft, unit_id: e.target.value })
                }
                className={inputClass()}
                required
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select
                value={draft.category_id}
                onChange={(e) =>
                  setDraft({ ...draft, category_id: e.target.value })
                }
                className={inputClass()}
              >
                <option value="">— None —</option>
                {categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Cost method">
              <select
                value={draft.cost_method}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    cost_method: e.target.value as "average" | "fifo",
                  })
                }
                className={inputClass()}
              >
                <option value="average">Moving average</option>
                <option value="fifo">FIFO</option>
              </select>
            </Field>
            <Field label="Default sell price">
              <CurrencyInput
                valueMinor={draft.sell}
                onValueChange={(v) => setDraft({ ...draft, sell: v })}
              />
            </Field>
            <Field label="Default buy price">
              <CurrencyInput
                valueMinor={draft.buy}
                onValueChange={(v) => setDraft({ ...draft, buy: v })}
              />
            </Field>
            <Field label="Minimum stock">
              <input
                type="number"
                min={0}
                value={draft.min_stock}
                onChange={(e) =>
                  setDraft({ ...draft, min_stock: e.target.value })
                }
                className={inputClass("tabular-nums")}
              />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-fg-muted">
                Images{" "}
                <span className="text-fg-subtle">
                  ({editTarget ? images.length : staged.length}/{MAX_IMAGES})
                </span>
              </label>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={
                  uploading ||
                  (editTarget
                    ? images.length >= MAX_IMAGES
                    : staged.length >= MAX_IMAGES)
                }
                className="text-xs text-accent hover:text-accent-hover disabled:opacity-50"
              >
                + Add images
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (!e.target.files || e.target.files.length === 0) return;
                if (editTarget) handleAddToEdit(e.target.files);
                else {
                  readFiles(e.target.files).then((prep) =>
                    setStaged((prev) =>
                      [...prev, ...prep].slice(0, MAX_IMAGES),
                    ),
                  );
                  e.target.value = "";
                }
              }}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {editTarget &&
                images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border border-border bg-bg-subtle"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageContentUrl(img.id)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    {img.is_primary && (
                      <span className="absolute left-1 top-1 rounded bg-accent-solid px-1 py-0.5 text-[9px] font-semibold uppercase text-white">
                        Main
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center gap-1 bg-[#0B0D10]/60 opacity-0 transition-opacity group-hover:opacity-100">
                      {!img.is_primary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(img)}
                          aria-label="Set as thumbnail"
                          title="Set as thumbnail"
                          className="rounded p-1 text-white hover:bg-white/20"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden
                          >
                            <path d="M12 2l2.9 6.26L21 9.27l-5 4.87L17.18 21 12 17.77 6.82 21 8 14.14l-5-4.87 6.1-1.01z" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteImageTarget(img)}
                        aria-label="Delete image"
                        title="Delete image"
                        className="rounded p-1 text-white hover:bg-danger/60"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              {!editTarget &&
                staged.map((s) => (
                  <div
                    key={s.key}
                    className="group relative h-16 w-16 overflow-hidden rounded-md border border-border bg-bg-subtle"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.dataUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setStaged((prev) => prev.filter((x) => x.key !== s.key))
                      }
                      aria-label="Remove staged image"
                      className="absolute inset-0 flex items-center justify-center bg-[#0B0D10]/60 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-white"
                        aria-hidden
                      >
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>
            <p className="mt-1 text-xs text-fg-subtle">
              {editTarget
                ? "Hover an image to set the thumbnail or remove it. Changes save immediately."
                : "PNG, JPEG, or WebP up to 2 MB each. Images upload right after the product is saved."}
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setEditTarget(null);
                setStaged([]);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || uploading}>
              {submitting
                ? "Saving..."
                : editTarget
                  ? "Save changes"
                  : "Save product"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteImageTarget !== null}
        onClose={() => setDeleteImageTarget(null)}
        onConfirm={handleDeleteImage}
        title="Remove this image?"
        description="If it is the thumbnail, the next image takes over automatically."
        confirmLabel="Remove image"
        variant="danger"
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The product leaves the active catalog. Historical movements keep resolving by ID."
        confirmLabel="Delete product"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

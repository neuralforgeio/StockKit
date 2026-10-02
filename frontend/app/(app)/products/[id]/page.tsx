"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import {
  deleteProductImage,
  getProduct,
  imageContentUrl,
  listProductImages,
  setPrimaryProductImage,
  uploadProductImage,
  type Product,
  type ProductImageMeta,
} from "@/lib/api/products";
import {
  listMovements,
  listStockLevels,
  type Movement,
  type StockLevel,
} from "@/lib/api/inventory";
import { formatIDR } from "@/lib/format";

type Tab = "stock" | "movements";

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImageMeta[]>([]);
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [tab, setTab] = useState<Tab>("stock");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductImageMeta | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, imgs, levels, movs] = await Promise.all([
        getProduct(id),
        listProductImages(id),
        listStockLevels(),
        listMovements({ product_id: id, limit: 50 }),
      ]);
      setProduct(p);
      setImages(imgs);
      setStockLevels(levels.filter((s) => s.product_id === id));
      setMovements(movs.data);
    } catch (err: any) {
      toast.error("Unable to load product", err.message);
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          toast.warning(
            "Unsupported image skipped",
            `${file.name}: use PNG, JPEG, or WebP.`,
          );
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Read failed"));
          reader.readAsDataURL(file);
        });
        const [meta, b64] = dataUrl.split(",");
        const mime = meta.slice(5, meta.indexOf(";"));
        await uploadProductImage(id, mime, b64);
      }
      toast.success(
        "Images uploaded",
        "The first image becomes the catalog thumbnail.",
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
    try {
      await setPrimaryProductImage(img.id, id);
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
    if (!deleteTarget) return;
    try {
      await deleteProductImage(deleteTarget.id);
      toast.success("Image removed", "The gallery was updated.");
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      toast.error("Delete failed", err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-40 animate-pulse rounded-xl border border-border bg-bg" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg" />
      </div>
    );
  }

  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        description="It may have been deleted or belongs to another workspace."
        action={
          <Link href="/products">
            <Button>Back to products</Button>
          </Link>
        }
      />
    );
  }

  const primary = images.find((i) => i.is_primary) ?? images[0];
  const totalOnHand = stockLevels.reduce((s, x) => s + x.on_hand, 0);
  const totalValue = stockLevels.reduce((s, x) => s + x.stock_value_minor, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
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
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Products
      </Link>

      {/* Hero header */}
      <section className="card-surface overflow-hidden rounded-xl border border-border">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-border bg-bg-subtle">
            {primary ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageContentUrl(primary.id)}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-fg-subtle">
                <svg
                  width="32"
                  height="32"
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
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-fg">
                {product.name}
              </h1>
              <span className="rounded-md border border-border bg-bg-subtle px-2 py-0.5 font-mono text-xs text-fg-muted">
                {product.sku}
              </span>
              <span className="rounded-full bg-accent-subtle px-2.5 py-0.5 text-xs font-medium text-accent">
                {product.type}
              </span>
            </div>
            <p className="mt-1 text-sm text-fg-muted">
              {product.cost_method === "fifo"
                ? "FIFO costing"
                : "Moving average costing"}{" "}
              · min stock {product.min_stock}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroStat
                label="On hand"
                value={totalOnHand.toLocaleString("id-ID")}
              />
              <HeroStat
                label="Avg cost"
                value={formatIDR(stockLevels[0]?.avg_cost_minor ?? 0)}
              />
              <HeroStat
                label="Sell price"
                value={formatIDR(product.default_sell_price_minor)}
              />
              <HeroStat label="Stock value" value={formatIDR(totalValue)} />
            </div>
          </div>
        </div>

        {/* Gallery strip */}
        <div className="border-t border-border bg-bg-subtle/60 px-5 py-4">
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-bg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageContentUrl(img.id)}
                  alt=""
                  className="h-full w-full object-cover"
                />
                {img.is_primary && (
                  <span className="absolute left-1 top-1 rounded bg-accent-solid px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                    Main
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-[#0B0D10]/60 opacity-0 transition-opacity group-hover:opacity-100">
                  {!img.is_primary && (
                    <button
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
                    onClick={() => setDeleteTarget(img)}
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
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border-strong bg-bg text-fg-subtle transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              aria-label="Upload images"
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
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="text-[9px] font-medium">
                {uploading ? "..." : "Add"}
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0)
                  handleUpload(e.target.files);
              }}
            />
          </div>
          <p className="mt-2 text-xs text-fg-subtle">
            PNG, JPEG, or WebP up to 2 MB each, maximum 8 images. Hover an image
            to set the thumbnail or remove it.
          </p>
        </div>
      </section>

      {/* Tabs */}
      <section className="card-surface overflow-hidden rounded-xl border border-border">
        <nav className="flex gap-1 border-b border-border bg-bg-subtle/60 px-3 pt-2">
          {(
            [
              ["stock", "Stock levels"],
              ["movements", "Movements"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-accent bg-bg text-accent"
                  : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "stock" &&
          (stockLevels.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              No stock recorded for this product yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-5 py-2.5">Warehouse</th>
                    <th className="px-5 py-2.5 text-right">On hand</th>
                    <th className="px-5 py-2.5 text-right">Reserved</th>
                    <th className="px-5 py-2.5 text-right">Available</th>
                    <th className="px-5 py-2.5 text-right">Avg cost</th>
                    <th className="px-5 py-2.5 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stockLevels.map((s) => (
                    <tr
                      key={s.warehouse_id}
                      className="transition-colors hover:bg-bg-subtle/50"
                    >
                      <td className="px-5 py-2.5 font-mono text-xs text-fg">
                        {s.warehouse_code}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                        {s.on_hand}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                        {s.reserved}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                        {s.available}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                        {formatIDR(s.avg_cost_minor)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                        {formatIDR(s.stock_value_minor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {tab === "movements" &&
          (movements.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">
              No movements recorded for this product yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
                  <tr>
                    <th className="px-5 py-2.5 w-16">Seq</th>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Type</th>
                    <th className="px-5 py-2.5">Warehouse</th>
                    <th className="px-5 py-2.5 text-right">Qty</th>
                    <th className="px-5 py-2.5 text-right">Unit cost</th>
                    <th className="px-5 py-2.5 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movements.map((m) => (
                    <tr
                      key={m.id}
                      className="transition-colors hover:bg-bg-subtle/50"
                    >
                      <td className="px-5 py-2.5 tabular-nums text-fg-subtle">
                        {m.movement_seq}
                      </td>
                      <td className="px-5 py-2.5 text-fg-muted">
                        {new Date(m.created_at).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            m.movement_type.includes("IN")
                              ? "bg-success/10 text-success"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {m.movement_type}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 font-mono text-xs text-fg">
                        {m.warehouse_code}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                        {m.qty}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg-muted">
                        {formatIDR(m.unit_cost_minor)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-fg">
                        {m.balance_after}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteImage}
        title="Remove this image?"
        description="The image will be deleted from the product gallery. If it is the thumbnail, the next image takes over automatically."
        confirmLabel="Remove image"
        variant="danger"
      />
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle/60 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-fg">
        {value}
      </p>
    </div>
  );
}

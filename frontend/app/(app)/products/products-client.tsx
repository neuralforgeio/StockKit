"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { deleteProduct, listProducts, type Product } from "@/lib/api/products";
import { formatIDR } from "@/lib/format";

type Props = {
  initial: { data: Product[]; next_cursor: string | null };
  unitsMap: Record<string, string>;
};

export function ProductsClient({ initial, unitsMap }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const createdSku = searchParams.get("created");

  const [items, setItems] = useState<Product[]>(initial.data);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial.next_cursor,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [toast, setToast] = useState<string | null>(
    createdSku ? `Created ${createdSku}` : null,
  );

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await listProducts(nextCursor);
      setItems((prev) => [...prev, ...more.data]);
      setNextCursor(more.next_cursor);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  const handleDelete = async (p: Product) => {
    if (!confirm(`Delete product "${p.name}"? This cannot be undone.`)) return;
    try {
      await deleteProduct(p.id);
      setItems((prev) => prev.filter((x) => x.id !== p.id));
      setToast(`Deleted ${p.sku}`);
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        title="No products yet"
        description="Create the first product to start tracking stock."
        action={
          <Link href="/products/new">
            <Button>Create product</Button>
          </Link>
        }
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-bg">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-bg-subtle text-left text-xs font-medium uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Unit</th>
              <th className="px-4 py-2.5 text-right">Sell price</th>
              <th className="px-4 py-2.5 text-right">Buy price</th>
              <th className="px-4 py-2.5 text-center">Min stock</th>
              <th className="px-4 py-2.5 text-center">Cost</th>
              <th className="px-4 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-bg-subtle/50">
                <td className="px-4 py-2.5 font-mono text-xs text-fg">
                  {p.sku}
                </td>
                <td className="px-4 py-2.5 text-fg">{p.name}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-fg-muted">
                    {p.type}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-fg-muted">
                  {unitsMap[p.unit_id] ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatIDR(p.default_sell_price_minor)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg-muted">
                  {formatIDR(p.default_buy_price_minor)}
                </td>
                <td className="px-4 py-2.5 text-center tabular-nums text-fg-muted">
                  {p.min_stock}
                </td>
                <td className="px-4 py-2.5 text-center text-xs text-fg-muted">
                  {p.cost_method}
                </td>
                <td className="px-4 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(p)}
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {nextCursor && (
          <div className="flex justify-center border-t border-border p-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 rounded-md border border-border bg-bg px-4 py-2.5 text-sm text-fg shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  );
}

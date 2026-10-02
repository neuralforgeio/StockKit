import { apiFetch } from "./client";

export type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  type: "product" | "service";
  category_id: string | null;
  unit_id: string;
  cost_method: "average" | "fifo";
  default_sell_price_minor: number;
  default_buy_price_minor: number;
  min_stock: number;
  active: boolean;
  primary_image_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductImageMeta = {
  id: string;
  product_id: string;
  position: number;
  is_primary: boolean;
  mime: string;
  created_at: string;
};

export type CreateProductPayload = {
  sku: string;
  name: string;
  unit_id: string;
  type?: "product" | "service";
  cost_method?: "average" | "fifo";
  default_sell_price_minor?: number;
  default_buy_price_minor?: number;
  min_stock?: number;
  barcode?: string | null;
  category_id?: string | null;
};

export function imageContentUrl(imageId: string): string {
  return `/api/v1/product-images/${imageId}/content`;
}

export async function listProducts(cursor?: string, limit = 25) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<{ data: Product[]; next_cursor: string | null }>(
    `/products?${params}`,
  );
}

export async function getProduct(id: string) {
  const body = await apiFetch<{ data: Product }>(`/products/${id}`);
  return body.data;
}

export async function getNextSKU(): Promise<string> {
  const body = await apiFetch<{ data: { sku: string } }>("/products/next-sku");
  return body.data.sku;
}

export async function createProduct(payload: CreateProductPayload) {
  const body = await apiFetch<{ data: Product }>("/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateProduct(id: string, payload: CreateProductPayload) {
  const body = await apiFetch<{ data: Product }>(`/products/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteProduct(id: string) {
  await apiFetch<{ status: string }>(`/products/${id}`, { method: "DELETE" });
}

export async function listProductImages(
  productId: string,
): Promise<ProductImageMeta[]> {
  const body = await apiFetch<{ data: ProductImageMeta[] }>(
    `/products/${productId}/images`,
  );
  return body.data;
}

export async function uploadProductImage(
  productId: string,
  mime: string,
  dataBase64: string,
) {
  const body = await apiFetch<{ data: ProductImageMeta }>(
    `/products/${productId}/images`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime, data_base64: dataBase64 }),
    },
  );
  return body.data;
}

export async function deleteProductImage(imageId: string) {
  await apiFetch<{ status: string }>(`/product-images/${imageId}`, {
    method: "DELETE",
  });
}

export async function setPrimaryProductImage(
  imageId: string,
  productId: string,
) {
  await apiFetch<{ status: string }>(`/product-images/${imageId}/set-primary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: productId }),
  });
}

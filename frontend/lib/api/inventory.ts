import { apiFetch } from "./client";

export type StockLevel = {
  tenant_id: string;
  product_id: string;
  warehouse_id: string;
  product_name: string;
  product_sku: string;
  warehouse_code: string;
  unit_code: string;
  on_hand: number;
  reserved: number;
  available: number;
  avg_cost_minor: number;
  stock_value_minor: number;
  updated_at: string;
};

export type Movement = {
  id: string;
  tenant_id: string;
  movement_seq: number;
  document_type: string;
  document_id: string;
  movement_type: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  warehouse_id: string;
  warehouse_code: string;
  qty: number;
  unit_cost_minor: number;
  cogs_minor: number | null;
  balance_after: number;
  actor_user_id: string;
  created_at: string;
};

export type AdjustmentPayload = {
  product_id: string;
  warehouse_id: string;
  movement_type: "ADJ_IN" | "ADJ_OUT";
  qty: number;
  unit_cost_minor: number;
  reason: string;
};

export async function listStockLevels(): Promise<StockLevel[]> {
  const body = await apiFetch<{ data: StockLevel[] }>(
    "/inventory/stock-levels",
  );
  return body.data;
}

export async function listMovements(params: {
  product_id?: string;
  warehouse_id?: string;
  cursor?: number;
  limit?: number;
}): Promise<{ data: Movement[]; next_cursor: number | null }> {
  const search = new URLSearchParams();
  if (params.product_id) search.set("product_id", params.product_id);
  if (params.warehouse_id) search.set("warehouse_id", params.warehouse_id);
  if (params.cursor !== undefined) search.set("cursor", String(params.cursor));
  if (params.limit) search.set("limit", String(params.limit));
  return apiFetch(`/inventory/movements?${search}`);
}

export async function recordAdjustment(payload: AdjustmentPayload) {
  const body = await apiFetch<{ data: Movement }>("/inventory/adjustments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

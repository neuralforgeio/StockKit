import { apiFetch } from "./client";

export type WarehouseStock = {
  warehouse_id: string;
  code: string;
  name: string;
  lines: number;
  units_on_hand: number;
  value_minor: number;
};

export type RecentMovement = {
  movement_seq: number;
  movement_type: string;
  product_sku: string;
  product_name: string;
  warehouse_code: string;
  qty: number;
  balance_after: number;
  created_at: string;
};

export type DashboardSummary = {
  inventory_value_minor: number;
  units_on_hand: number;
  sku_count: number;
  low_stock_count: number;
  customer_count: number;
  supplier_count: number;
  warehouses: WarehouseStock[];
  recent_movements: RecentMovement[];
};

export async function getSummary(): Promise<DashboardSummary> {
  const body = await apiFetch<{ data: DashboardSummary }>("/dashboard/summary");
  return body.data;
}

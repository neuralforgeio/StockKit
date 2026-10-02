import { apiFetch } from "./client";

export type PurchaseRequestLine = {
  id: string;
  purchase_request_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  estimated_price_minor: number;
  note: string | null;
  converted_qty: number;
};

export type PurchaseRequest = {
  id: string;
  tenant_id: string;
  number: string;
  requester_id: string;
  cost_center: string | null;
  reason: string;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  converted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  lines: PurchaseRequestLine[];
};

export type PurchaseOrderLine = {
  id: string;
  purchase_order_id: string;
  purchase_request_line_id: string | null;
  product_id: string;
  product_name: string;
  product_sku: string;
  qty_ordered: number;
  allowed_qty: number;
  received_qty: number;
  unit_price_minor: number;
};

export type PurchaseOrder = {
  id: string;
  tenant_id: string;
  number: string;
  purchase_request_id: string | null;
  supplier_id: string;
  supplier_code: string;
  warehouse_id: string;
  warehouse_code: string;
  terms: string;
  expected_date: string | null;
  status: string;
  issued_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  total_minor: number;
  lines: PurchaseOrderLine[];
};

export type GoodsReceiptLine = {
  id: string;
  goods_receipt_id: string;
  purchase_order_line_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  qty_received: number;
  unit_cost_minor: number;
  discrepancy_note: string | null;
};

export type GoodsReceipt = {
  id: string;
  tenant_id: string;
  number: string;
  purchase_order_id: string;
  purchase_order_number: string;
  warehouse_id: string;
  warehouse_code: string;
  note: string;
  received_by: string;
  received_at: string;
  created_at: string;
  total_value_minor: number;
  lines: GoodsReceiptLine[];
};

export type CreatePurchaseRequestPayload = {
  cost_center?: string | null;
  reason: string;
  lines: {
    product_id: string;
    quantity: number;
    estimated_price_minor: number;
    note?: string | null;
  }[];
};

export type ConvertPRPayload = {
  supplier_id: string;
  warehouse_id: string;
  expected_date?: string | null;
  lines: {
    purchase_request_line_id: string;
    quantity: number;
    unit_price_minor: number;
  }[];
};

export type RecordGRPayload = {
  purchase_order_id: string;
  warehouse_id: string;
  note?: string;
  lines: {
    purchase_order_line_id: string;
    qty_received: number;
    unit_cost_minor: number;
    discrepancy_note?: string | null;
  }[];
};

export async function listPurchaseRequests(): Promise<PurchaseRequest[]> {
  const body = await apiFetch<{ data: PurchaseRequest[] }>("/purchase-requests");
  return body.data;
}

export async function getPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const body = await apiFetch<{ data: PurchaseRequest }>(`/purchase-requests/${id}`);
  return body.data;
}

export async function createPurchaseRequest(payload: CreatePurchaseRequestPayload) {
  const body = await apiFetch<{ data: PurchaseRequest }>("/purchase-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updatePurchaseRequest(id: string, payload: CreatePurchaseRequestPayload) {
  const body = await apiFetch<{ data: PurchaseRequest }>(`/purchase-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function submitPurchaseRequest(id: string) {
  const body = await apiFetch<{ data: PurchaseRequest; approval_instance: unknown }>(
    `/purchase-requests/${id}/submit`,
    { method: "POST" },
  );
  return body;
}

export async function cancelPurchaseRequest(id: string) {
  const body = await apiFetch<{ data: PurchaseRequest }>(`/purchase-requests/${id}/cancel`, {
    method: "POST",
  });
  return body.data;
}

export async function convertPurchaseRequest(id: string, payload: ConvertPRPayload) {
  const body = await apiFetch<{ data: PurchaseOrder }>(`/purchase-requests/${id}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function listPurchaseOrders(): Promise<PurchaseOrder[]> {
  const body = await apiFetch<{ data: PurchaseOrder[] }>("/purchase-orders");
  return body.data;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const body = await apiFetch<{ data: PurchaseOrder }>(`/purchase-orders/${id}`);
  return body.data;
}

export async function listGoodsReceipts(): Promise<GoodsReceipt[]> {
  const body = await apiFetch<{ data: GoodsReceipt[] }>("/goods-receipts");
  return body.data;
}

export async function getGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const body = await apiFetch<{ data: GoodsReceipt }>(`/goods-receipts/${id}`);
  return body.data;
}

export async function recordGoodsReceipt(payload: RecordGRPayload) {
  const body = await apiFetch<{ data: GoodsReceipt }>("/goods-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

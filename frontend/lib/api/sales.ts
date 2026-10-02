import { apiFetch } from "./client";

export type SalesOrderLine = {
  id: string;
  sales_order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price_minor: number;
  reserved_qty: number;
  delivered_qty: number;
  cost_method: string;
};

export type SalesOrder = {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  warehouse_id: string;
  warehouse_code: string;
  status: string;
  price_list: string;
  note: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  total_minor: number;
  currency?: string;
  exchange_rate?: number;
  base_amount_minor?: number;
  lines: SalesOrderLine[];
  approval_status?: string;
};

export type CustomerInvoice = any;
export type CustomerReceipt = any;

export type CreateSalesOrderPayload = {
  customer_id: string;
  warehouse_id: string;
  note?: string;
  currency?: string;
  lines: { product_id: string; quantity: number; unit_price_minor: number }[];
};

export type UpdateSalesOrderPayload = {
  customer_id?: string;
  warehouse_id?: string;
  note?: string;
  currency?: string;
  lines?: { product_id: string; quantity: number; unit_price_minor: number }[];
};

export async function listSalesOrders(): Promise<SalesOrder[]> {
  const body = await apiFetch<{ data: SalesOrder[] }>("/sales-orders");
  return body.data;
}

export async function getSalesOrder(id: string): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}`);
  return body.data;
}

export async function createSalesOrder(
  payload: CreateSalesOrderPayload,
): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>("/sales-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateSalesOrder(
  id: string,
  payload: UpdateSalesOrderPayload,
): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(`/sales-orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteSalesOrder(id: string): Promise<void> {
  await apiFetch<{ status: string }>(`/sales-orders/${id}`, {
    method: "DELETE",
  });
}

export async function submitSalesOrder(id: string): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(
    `/sales-orders/${id}/submit`,
    { method: "POST" },
  );
  return body.data;
}

export async function checkoutSalesOrder(id: string): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(
    `/sales-orders/${id}/checkout`,
    { method: "POST" },
  );
  return body.data;
}

export async function deliverSalesOrder(id: string): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(
    `/sales-orders/${id}/deliver`,
    { method: "POST" },
  );
  return body.data;
}

export async function cancelSalesOrder(id: string): Promise<SalesOrder> {
  const body = await apiFetch<{ data: SalesOrder }>(
    `/sales-orders/${id}/cancel`,
    { method: "POST" },
  );
  return body.data;
}

export async function listCustomerInvoices(): Promise<CustomerInvoice[]> {
  const body = await apiFetch<{ data: CustomerInvoice[] }>(
    "/customer-invoices",
  );
  return body.data;
}

export async function createCustomerInvoice(
  payload: any,
): Promise<CustomerInvoice> {
  const body = await apiFetch<{ data: CustomerInvoice }>("/customer-invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function listCustomerReceipts(): Promise<CustomerReceipt[]> {
  const body = await apiFetch<{ data: CustomerReceipt[] }>(
    "/customer-receipts",
  );
  return body.data;
}

export async function recordCustomerReceipt(
  payload: any,
): Promise<CustomerReceipt> {
  const body = await apiFetch<{ data: CustomerReceipt }>("/customer-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

import { apiFetch } from "./client";

export type SupplierInvoiceLine = {
  id: string;
  invoice_id: string;
  purchase_order_line_id: string | null;
  product_id: string;
  product_name: string;
  product_sku: string;
  qty_invoiced: number;
  unit_price_minor: number;
  match_status: "matched" | "disputed";
  match_note: string | null;
};

export type SupplierInvoice = {
  id: string;
  tenant_id: string;
  number: string;
  supplier_id: string;
  supplier_code: string;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total_minor: number;
  paid_minor: number;
  note: string;
  created_at: string;
  updated_at: string;
  lines: SupplierInvoiceLine[];
};

export type Payment = {
  id: string;
  tenant_id: string;
  number: string;
  supplier_invoice_id: string;
  supplier_invoice_number: string;
  cash_account_id: string;
  cash_account_name: string;
  amount_minor: number;
  payment_date: string;
  payment_method: string;
  reference: string;
  note: string;
  status: "completed" | "cancelled";
  recorded_by: string;
  created_at: string;
};

export async function getNextInvoiceNumber(): Promise<string> {
  const body = await apiFetch<{ data: { number: string } }>(
    "/supplier-invoices/next-number",
  );
  return body.data.number;
}

export async function listSupplierInvoices(): Promise<SupplierInvoice[]> {
  const body = await apiFetch<{ data: SupplierInvoice[] }>(
    "/supplier-invoices",
  );
  return body.data;
}

export async function getSupplierInvoice(id: string): Promise<SupplierInvoice> {
  const body = await apiFetch<{ data: SupplierInvoice }>(
    `/supplier-invoices/${id}`,
  );
  return body.data;
}

export async function createSupplierInvoice(payload: {
  supplier_id: string;
  purchase_order_id?: string | null;
  goods_receipt_id?: string | null;
  due_date?: string | null;
  note?: string;
  lines: {
    purchase_order_line_id?: string | null;
    product_id: string;
    qty_invoiced: number;
    unit_price_minor: number;
  }[];
}) {
  const body = await apiFetch<{ data: SupplierInvoice }>("/supplier-invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function listPayments(): Promise<Payment[]> {
  const body = await apiFetch<{ data: Payment[] }>("/payments");
  return body.data;
}

export async function recordPayment(payload: {
  supplier_invoice_id: string;
  cash_account_id: string;
  amount_minor: number;
  payment_date?: string | null;
  payment_method?: string;
  reference?: string;
  note?: string;
}) {
  const body = await apiFetch<{ data: Payment }>("/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payment_method: "transfer", ...payload }),
  });
  return body.data;
}

export async function cancelPayment(id: string) {
  const body = await apiFetch<{ data: Payment }>(`/payments/${id}/cancel`, {
    method: "POST",
  });
  return body.data;
}

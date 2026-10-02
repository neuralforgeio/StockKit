import { apiFetch } from "./client";

export type Supplier = {
  id: string;
  code: string;
  name: string;
  contact_name: string;
  email: string | null;
  phone: string;
  address: string;
  tax_id: string;
  payment_terms_days: number;
  bank_account_masked: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SupplierPayload = {
  name: string;
  contact_name?: string;
  email?: string | null;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms_days?: number;
  bank_account?: string | null;
};

export async function listSuppliers(): Promise<Supplier[]> {
  const body = await apiFetch<{ data: Supplier[] }>("/suppliers");
  return body.data;
}

export async function createSupplier(payload: SupplierPayload) {
  const body = await apiFetch<{ data: Supplier }>("/suppliers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateSupplier(id: string, payload: SupplierPayload) {
  const body = await apiFetch<{ data: Supplier }>(`/suppliers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function setSupplierActive(id: string, active: boolean) {
  await apiFetch<{ status: string }>(`/suppliers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}

export async function deleteSupplier(id: string) {
  await apiFetch<{ status: string }>(`/suppliers/${id}`, { method: "DELETE" });
}

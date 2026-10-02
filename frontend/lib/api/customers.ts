import { apiFetch } from "./client";

export type Customer = {
  id: string;
  code: string;
  name: string;
  type: "company" | "individual";
  contact_name: string;
  email: string | null;
  phone: string;
  payment_terms_days: number;
  credit_limit_minor: number;
  open_exposure_minor: number;
  active: boolean;
};

export type CustomerPayload = {
  name: string;
  type?: string;
  contact_name?: string;
  email?: string | null;
  phone?: string;
  payment_terms_days?: number;
  credit_limit_minor?: number;
};

export async function listCustomers(): Promise<Customer[]> {
  const body = await apiFetch<{ data: Customer[] }>("/customers");
  return body.data;
}

export async function createCustomer(payload: CustomerPayload) {
  const body = await apiFetch<{ data: Customer }>("/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateCustomer(id: string, payload: CustomerPayload) {
  const body = await apiFetch<{ data: Customer }>(`/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function setCustomerActive(id: string, active: boolean) {
  await apiFetch<{ status: string }>(`/customers/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}

export async function deleteCustomer(id: string) {
  await apiFetch<{ status: string }>(`/customers/${id}`, { method: "DELETE" });
}

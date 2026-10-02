import { apiFetch } from "./client";

export type CashAccount = {
  id: string;
  tenant_id: string;
  number: string;
  name: string;
  account_type: "cash" | "bank" | "ewallet";
  currency: string;
  balance_minor: number;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  payment_count: number;
  payment_total: number;
};

export async function listCashAccounts(): Promise<CashAccount[]> {
  const body = await apiFetch<{ data: CashAccount[] }>("/cash-accounts");
  return body.data;
}

export async function getCashAccount(id: string): Promise<CashAccount> {
  const body = await apiFetch<{ data: CashAccount }>(`/cash-accounts/${id}`);
  return body.data;
}

export async function createCashAccount(payload: {
  name: string;
  account_type: string;
  currency?: string;
  balance_minor: number;
  notes?: string;
}) {
  const body = await apiFetch<{ data: CashAccount }>("/cash-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency: "IDR", notes: "", ...payload }),
  });
  return body.data;
}

export async function updateCashAccount(
  id: string,
  payload: { name?: string; account_type?: string; notes?: string },
) {
  const body = await apiFetch<{ data: CashAccount }>(`/cash-accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function setCashAccountActive(id: string, active: boolean) {
  const body = await apiFetch<{ data: CashAccount }>(
    `/cash-accounts/${id}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    },
  );
  return body.data;
}

export async function deleteCashAccount(id: string) {
  await apiFetch<unknown>(`/cash-accounts/${id}`, { method: "DELETE" });
}

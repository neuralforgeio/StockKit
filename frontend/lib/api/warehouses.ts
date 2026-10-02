import { apiFetch } from "./client";

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  branch: string | null;
  active: boolean;
};

export type WarehousePayload = { name: string; branch?: string | null };

export async function listWarehouses(): Promise<Warehouse[]> {
  const body = await apiFetch<{ data: Warehouse[] }>("/warehouses");
  return body.data;
}

export async function createWarehouse(payload: WarehousePayload) {
  const body = await apiFetch<{ data: Warehouse }>("/warehouses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateWarehouse(id: string, payload: WarehousePayload) {
  const body = await apiFetch<{ data: Warehouse }>(`/warehouses/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function setWarehouseActive(id: string, active: boolean) {
  await apiFetch<{ status: string }>(`/warehouses/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}

export async function deleteWarehouse(id: string) {
  await apiFetch<{ status: string }>(`/warehouses/${id}`, { method: "DELETE" });
}

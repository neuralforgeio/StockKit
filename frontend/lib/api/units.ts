import { apiFetch } from "./client";

export type Unit = { id: string; code: string; name: string; active: boolean };

export type UnitPayload = { code: string; name: string };

export async function listUnits(): Promise<Unit[]> {
  const body = await apiFetch<{ data: Unit[] }>("/units");
  return body.data;
}

export async function createUnit(payload: UnitPayload) {
  const body = await apiFetch<{ data: Unit }>("/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateUnit(id: string, payload: UnitPayload) {
  const body = await apiFetch<{ data: Unit }>(`/units/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function deleteUnit(id: string) {
  await apiFetch<{ status: string }>(`/units/${id}`, { method: "DELETE" });
}

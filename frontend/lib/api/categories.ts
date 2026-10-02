import { apiFetch } from "./client";

export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  active: boolean;
};

export type CategoryPayload = { name: string; parent_id?: string | null };

export async function listCategories(): Promise<Category[]> {
  const body = await apiFetch<{ data: Category[] }>("/categories");
  return body.data;
}

export async function createCategory(payload: CategoryPayload) {
  const body = await apiFetch<{ data: Category }>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function updateCategory(id: string, payload: CategoryPayload) {
  const body = await apiFetch<{ data: Category }>(`/categories/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

export async function setCategoryActive(id: string, active: boolean) {
  await apiFetch<{ status: string }>(`/categories/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
}

export async function deleteCategory(id: string) {
  await apiFetch<{ status: string }>(`/categories/${id}`, { method: "DELETE" });
}

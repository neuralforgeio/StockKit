import { apiFetch } from "./client";

export type Me = {
  user_id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  has_avatar: boolean;
};

export async function getMe(): Promise<Me> {
  const body = await apiFetch<{ data: Me }>("/users/me");
  return body.data;
}

export function hasAvatar(me: Me): boolean {
  return me.has_avatar;
}

export async function updateMe(fullName: string) {
  await apiFetch<{ status: string }>("/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name: fullName }),
  });
}

export async function uploadAvatar(mime: string, dataBase64: string) {
  await apiFetch<{ status: string }>("/users/me/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mime, data_base64: dataBase64 }),
  });
}

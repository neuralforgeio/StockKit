import { apiFetch } from "./client";

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function listNotifications(): Promise<AppNotification[]> {
  const body = await apiFetch<{ data: AppNotification[] }>("/notifications");
  return body.data;
}

export async function getUnreadCount(): Promise<number> {
  const body = await apiFetch<{ data: { count: number } }>(
    "/notifications/unread-count",
  );
  return body.data.count;
}

export async function markNotificationRead(id: string) {
  await apiFetch<{ status: string }>(`/notifications/${id}/read`, {
    method: "POST",
  });
}

export async function markAllNotificationsRead() {
  await apiFetch<{ status: string }>("/notifications/read-all", {
    method: "POST",
  });
}

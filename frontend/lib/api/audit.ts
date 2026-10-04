import { apiFetch } from "./client";

export type AuditLog = {
  id: number;
  tenant_id: string;
  actor_user_id: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  old_data: any;
  new_data: any;
  metadata: any;
  created_at: string;
};

export type AuditFilter = {
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  event_type?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditLogs(
  filter: AuditFilter = {},
): Promise<{ data: AuditLog[]; total: number }> {
  const params = new URLSearchParams();
  if (filter.entity_type) params.set("entity_type", filter.entity_type);
  if (filter.entity_id) params.set("entity_id", filter.entity_id);
  if (filter.actor_id) params.set("actor_id", filter.actor_id);
  if (filter.event_type) params.set("event_type", filter.event_type);
  if (filter.from) params.set("from", filter.from);
  if (filter.to) params.set("to", filter.to);
  if (filter.limit) params.set("limit", String(filter.limit));
  if (filter.offset) params.set("offset", String(filter.offset));
  const qs = params.toString();
  const body = await apiFetch<{
    data: AuditLog[];
    pagination: { total: number };
  }>(`/audit-logs${qs ? "?" + qs : ""}`);
  return { data: body.data, total: body.pagination.total };
}

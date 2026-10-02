import { apiFetch } from "./client";

export type DevMe = {
  roles: string[];
  is_developer: boolean;
  is_owner: boolean;
};

export type DevMetrics = {
  goroutines: number;
  heap_alloc_mb: number;
  heap_sys_mb: number;
  gc_cycles: number;
  uptime_seconds: number;
  db_total_conns: number;
  db_idle_conns: number;
  db_acquired: number;
  log_files: number;
  log_bytes: number;
  go_version: string;
  go_os: string;
  go_arch: string;
};

export type DevDisk = {
  path: string;
  log_bytes: number;
  log_files: number;
  os_ok: boolean;
  free_bytes?: number;
  total_bytes?: number;
  used_pct?: number;
};

export type DevAnalytics = {
  per_hour: { hour: string; count: number }[];
  status: Record<string, number>;
  top_endpoints: { endpoint: string; count: number }[];
  levels: { level: string; count: number }[];
};

export async function getDevMe(): Promise<DevMe> {
  const body = await apiFetch<{ data: DevMe }>("/dev/me");
  return body.data;
}
export async function getDevMetrics(): Promise<DevMetrics> {
  const body = await apiFetch<{ data: DevMetrics }>("/dev/metrics");
  return body.data;
}
export async function getDevDisk(): Promise<DevDisk> {
  const body = await apiFetch<{ data: DevDisk }>("/dev/disk");
  return body.data;
}
export async function getDevAnalytics(): Promise<DevAnalytics> {
  const body = await apiFetch<{ data: DevAnalytics }>("/dev/analytics");
  return body.data;
}
export async function getDevLogs(
  limit = 200,
): Promise<{ lines: string[]; file: string }> {
  const body = await apiFetch<{ data: string[]; file: string }>(
    `/dev/logs?limit=${limit}`,
  );
  return { lines: body.data, file: body.file };
}

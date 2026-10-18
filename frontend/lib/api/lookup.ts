import { apiFetch } from "./client";

// Batch resolve entity UUIDs to human-readable labels for audit diffs.
export async function resolveLabels(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const body = await apiFetch<{ labels: Record<string, string> }>(
    "/audit-logs/resolve",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
  return body.labels ?? {};
}

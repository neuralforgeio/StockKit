import { apiFetch } from "./client";

export type FXRate = {
  id: string;
  tenant_id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  effective_date: string;
  source: string;
  created_at: string;
};

export async function listFXRates(): Promise<FXRate[]> {
  const body = await apiFetch<{ data: FXRate[] }>("/fx-rates");
  return body.data;
}

export async function getLatestFX(
  base = "USD",
  quote = "IDR",
): Promise<FXRate | null> {
  const body = await apiFetch<{ data: FXRate | null }>(
    `/fx-rates/latest?base=${base}&quote=${quote}`,
  );
  return body.data;
}

export async function upsertFXRate(payload: {
  base_currency: string;
  quote_currency: string;
  rate: number;
  effective_date?: string;
}) {
  const body = await apiFetch<{ data: FXRate }>("/fx-rates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return body.data;
}

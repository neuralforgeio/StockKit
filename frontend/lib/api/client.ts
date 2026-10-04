import { API_BASE } from "./base";

let refreshing: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith("csrf="));
  return entry ? entry.slice("csrf=".length) : null;
}

const MUTATIONS = ["POST", "PATCH", "PUT", "DELETE"];

function withCsrf(init?: RequestInit): RequestInit {
  const method = (init?.method ?? "GET").toUpperCase();
  if (!MUTATIONS.includes(method)) return init ?? {};
  const headers = new Headers(init?.headers);
  const token = csrfToken();
  if (token) headers.set("X-CSRF-Token", token);
  return { ...init, headers };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...withCsrf(init),
  });

  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await tryRefresh()) {
      res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        ...withCsrf(init),
      });
    }
  }

  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  const body = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const err = (
      body as {
        error?: {
          code?: string;
          message?: string;
          details?: Record<string, any>;
        };
      } | null
    )?.error;
    const apiErr = new Error(err?.message ?? "Request failed") as Error & {
      code?: string;
      details?: Record<string, any>;
    };
    apiErr.code = err?.code;
    apiErr.details = err?.details;
    throw apiErr;
  }
  return body as T;
}

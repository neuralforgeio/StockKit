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

export type ApiErrorShape = {
  code?: string;
  message?: string;
  details?: Record<string, any>;
};

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
    const env = (body as { error?: ApiErrorShape } | null)?.error;
    const code = env?.code ?? `HTTP_${res.status}`;
    const baseMsg = env?.message ?? "Request failed";

    let full = `[${code}] ${baseMsg}`;
    if (env?.details && Object.keys(env.details).length > 0) {
      const kv = Object.entries(env.details)
        .map(
          ([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`,
        )
        .join(", ");
      full += ` — ${kv}`;
    }

    // Visibility: 5xx = console.error (bug nyata); 4xx = console.warn
    // (error domain yang expected, tidak memenuhi Next dev overlay "Issues").
    if (typeof window !== "undefined") {
      const payload = {
        status: res.status,
        path,
        code,
        message: baseMsg,
        details: env?.details ?? null,
      };
      if (res.status >= 500) {
        // eslint-disable-next-line no-console
        console.error("[api]", payload);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[api]", payload);
      }
    }

    const e = new Error(full) as Error & {
      code?: string;
      details?: Record<string, any>;
      status?: number;
    };
    e.code = code;
    e.details = env?.details;
    e.status = res.status;
    throw e;
  }

  return body as T;
}

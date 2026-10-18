import { useEffect, useSyncExternalStore } from "react";
import { realtime } from "./realtime";
import { apiFetch } from "./api/client";

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  roles: string[];
  created_at?: string;
};

let cache: CurrentUser | null = null;
let loadPromise: Promise<CurrentUser> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

// Single-flight loader: berapa pun komponen yang mount, hanya 1 request.
export async function loadCurrentUser(force = false): Promise<CurrentUser> {
  if (cache && !force) return cache;
  if (!loadPromise) {
    loadPromise = apiFetch<any>("/users/me/profile")
      .then((m) => {
        const u = (m?.data ?? m) as CurrentUser;
        cache = u;
        emit();
        return u;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

// Optimistic local update (mis. setelah save di halaman profile).
export function setCurrentUser(patch: Partial<CurrentUser>) {
  if (!cache) return;
  cache = { ...cache, ...patch };
  emit();
}

// Event-driven: terapkan payload WS langsung (TANPA fetch). Fallback 1 fetch
// hanya bila payload tidak bisa dipakai.
let subscribed = false;
function subscribeRealtime() {
  if (subscribed) return;
  subscribed = true;
  realtime.on((ev) => {
    if (ev.kind !== "profile_updated") return;
    try {
      const d = JSON.parse(ev.body ?? "{}");
      if (!cache || d.user_id !== cache.id) return; // hanya profile sendiri
      setCurrentUser({
        full_name: d.full_name,
        email: d.email,
        status: d.status,
      });
    } catch {
      loadCurrentUser(true).catch(() => {});
    }
  });
}

export function useCurrentUser(): CurrentUser | null {
  subscribeRealtime();
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => cache,
    () => cache,
  );
  useEffect(() => {
    if (!cache) loadCurrentUser().catch(() => {});
  }, []);
  return snapshot;
}

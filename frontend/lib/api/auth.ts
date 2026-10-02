import { API_BASE } from "./base";
import { csrfToken } from "./client";

export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, remember_me: rememberMe }),
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Login failed");
  }
  return data;
}

export async function logout() {
  if (!csrfToken()) {
    await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
  }

  const headers = new Headers();
  const token = csrfToken();
  if (token) headers.set("X-CSRF-Token", token);

  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers,
    credentials: "include",
  }).catch(() => undefined);
}

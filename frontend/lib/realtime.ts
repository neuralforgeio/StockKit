import { apiFetch } from "./api/client";

export type RealtimeEvent = {
  id: string;
  kind: string;
  title: string;
  body: string;
  doc_type: string;
  doc_id: string;
  created_at: string;
};

type Handler = (ev: RealtimeEvent) => void;

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";

class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private retry = 1000;
  private closed = false;
  private connecting = false;

  // Preflight: force token auto-refresh via apiFetch (handles 401 -> refresh -> retry)
  // so the WS handshake never uses a stale cookie.
  async connect() {
    if (this.closed || this.connecting) return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    )
      return;
    this.connecting = true;
    try {
      await apiFetch<unknown>("/notifications/unread-count").catch(
        () => undefined,
      );
    } finally {
      this.connecting = false;
    }
    this.open();
  }

  private open() {
    const url = API_BASE.replace(/^http/, "ws") + "/notifications/ws";
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
    };
    ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as RealtimeEvent;
        this.handlers.forEach((h) => h(ev));
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (!this.closed) {
        setTimeout(() => this.connect(), this.retry);
        this.retry = Math.min(this.retry * 2, 15000);
      }
    };
    ws.onerror = () => ws.close();
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }

  close() {
    this.closed = true;
    this.ws?.close();
  }
}

export const realtime = new RealtimeClient();

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

  connect() {
    if (this.closed || (this.ws && this.ws.readyState <= WebSocket.OPEN))
      return;
    const url = API_BASE.replace(/^http/, "ws") + "/notifications/ws";
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.retry = 1000;
    };
    this.ws.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as RealtimeEvent;
        this.handlers.forEach((h) => h(ev));
      } catch {
        /* ignore malformed */
      }
    };
    this.ws.onclose = () => {
      if (!this.closed) {
        setTimeout(() => this.connect(), this.retry);
        this.retry = Math.min(this.retry * 2, 15000);
      }
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
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

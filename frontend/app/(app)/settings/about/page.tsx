import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StatusBadge, type Tone } from "@/components/status-badge";

const backendBase = process.env.BACKEND_URL ?? "http://localhost:8080";

type RuntimePins = {
  go: string;
  next: string;
  postgres: string;
  redis: string;
  object_storage: string;
};

type VersionInfo = {
  version: string;
  commit: string;
  build_date: string;
  environment: string;
  license: string;
  runtime: RuntimePins;
};

type ReadyInfo = {
  status: "ok" | "degraded" | "unavailable";
  degraded?: string[];
  failed?: string[];
};

async function fetchJson<T>(
  path: string,
  cookieHeader: string,
): Promise<{ status: number; body: T | null }> {
  try {
    const res = await fetch(`${backendBase}/api/v1${path}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

function readyTone(body: ReadyInfo | null): Tone {
  if (body?.status === "ok") return "success";
  if (body?.status === "degraded") return "warning";
  return "danger";
}

export default async function AboutPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  if (!cookieHeader) redirect("/login");

  const [ver, ready] = await Promise.all([
    fetchJson<VersionInfo>("/version", cookieHeader),
    fetchJson<ReadyInfo>("/readyz", cookieHeader),
  ]);

  if (ver.status === 0 || ver.body === null) {
    return (
      <div className="rounded-md border border-border bg-bg p-6 text-sm text-fg-muted">
        Unable to reach the backend API. Start the backend and reload this page.
      </div>
    );
  }

  const info = ver.body;
  const readyBody = ready.body;
  const services: Array<[string, string]> = [
    [
      "PostgreSQL",
      readyBody?.failed?.includes("postgres") ? "unavailable" : "ready",
    ],
    ["Redis", readyBody?.degraded?.includes("redis") ? "degraded" : "ready"],
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">About</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Build metadata and runtime health for this deployment.
          </p>
        </div>
        <StatusBadge
          label={readyBody ? readyBody.status : "unknown"}
          tone={readyTone(readyBody)}
        />
      </header>

      <section className="rounded-lg border border-border bg-bg">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-fg">
          Build
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Version", info.version],
              ["Commit", info.commit],
              ["Build date", info.build_date],
              ["Environment", info.environment],
              ["License", info.license],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="w-48 px-4 py-2.5 text-fg-muted">{label}</td>
                <td className="px-4 py-2.5 tabular-nums text-fg">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-border bg-bg">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-fg">
          Runtime pins
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {[
              ["Go", info.runtime.go],
              ["Next.js", info.runtime.next],
              ["PostgreSQL", info.runtime.postgres],
              ["Redis", info.runtime.redis],
              ["Object storage", info.runtime.object_storage],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="w-48 px-4 py-2.5 text-fg-muted">{label}</td>
                <td className="px-4 py-2.5 tabular-nums text-fg">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-border bg-bg">
        <h2 className="border-b border-border px-4 py-2.5 text-sm font-semibold text-fg">
          Services
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {services.map(([label, state]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="w-48 px-4 py-2.5 text-fg-muted">{label}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    label={state}
                    tone={
                      state === "ready"
                        ? "success"
                        : state === "degraded"
                          ? "warning"
                          : "danger"
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

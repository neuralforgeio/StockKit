import { Sparkline } from "./sparkline";

type Props = {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  spark?: number[];
  sparkTone?: "accent" | "success" | "warning" | "danger";
};

export function KpiCard({
  label,
  value,
  sub,
  icon,
  spark,
  sparkTone = "accent",
}: Props) {
  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-fg-muted">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-fg">
        {value}
      </p>
      <div className="mt-1 flex items-end justify-between gap-3">
        {sub ? (
          <p className="truncate text-xs text-fg-subtle">{sub}</p>
        ) : (
          <span />
        )}
        {spark && (
          <div className="w-24 shrink-0">
            <Sparkline values={spark} tone={sparkTone} />
          </div>
        )}
      </div>
    </div>
  );
}

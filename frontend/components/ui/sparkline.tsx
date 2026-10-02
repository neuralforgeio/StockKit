"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

type Tone = "accent" | "success" | "warning" | "danger";

const colors: Record<Tone, string> = {
  accent: "var(--color-accent)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

type Props = { values: number[]; tone?: Tone; height?: number };

export function Sparkline({ values, tone = "accent", height = 36 }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const series = (values.length >= 2 ? values : [0, 0]).map((v, i) => ({ i, v }));
  const color = colors[tone];

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gid})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
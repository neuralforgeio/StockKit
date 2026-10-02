"use client";

import { useEffect, useState } from "react";
import { formatIDR } from "@/lib/format";

export type MapPin = {
  id: string;
  label: string;
  units: number;
  value: number;
};

const W = 940;
const H = 350;
const BOUNDS = { minLon: 94.0, maxLon: 141.5, minLat: -11.5, maxLat: 6.5 };

function project(lon: number, lat: number): [number, number] {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * W;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H;
  return [x, y];
}

const CITY_COORDS: [string, number, number][] = [
  ["jakarta", 106.85, -6.21],
  ["bandung", 107.61, -6.91],
  ["madura", 113.29, -7.05],
  ["surabaya", 112.75, -7.25],
  ["medan", 98.67, 3.59],
  ["makassar", 119.43, -5.14],
  ["denpasar", 115.26, -8.65],
  ["semarang", 110.42, -6.99],
  ["yogyakarta", 110.36, -7.8],
  ["palembang", 104.75, -2.99],
  ["pontianak", 109.33, -0.03],
  ["balikpapan", 116.83, -1.24],
  ["manado", 124.84, 1.47],
  ["kupang", 123.6, -10.18],
  ["lampung", 105.26, -5.45],
  ["aceh", 95.32, 5.55],
  ["padang", 100.35, -0.95],
  ["banjarmasin", 114.59, -3.32],
  ["jayapura", 140.72, -2.53],
];

export function cityLabel(name: string): string {
  const lower = name.toLowerCase();
  const hit = CITY_COORDS.find(([key]) => lower.includes(key));
  if (!hit) return name;
  return hit[0].charAt(0).toUpperCase() + hit[0].slice(1);
}

function cityCoord(label: string, fallbackName: string): [number, number] {
  const lower = `${label} ${fallbackName}`.toLowerCase();
  const hit = CITY_COORDS.find(([key]) => lower.includes(key));
  if (hit) return [hit[1], hit[2]];
  return [106.85, -6.21];
}

function ringToPath(ring: number[][]): string {
  return (
    ring
      .map((c, i) => {
        const [x, y] = project(c[0], c[1]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

function geometryToPaths(geom: any): string[] {
  if (!geom) return [];
  if (geom.type === "Polygon") {
    return [
      geom.coordinates.map((ring: number[][]) => ringToPath(ring)).join(" "),
    ];
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.map((poly: number[][][]) =>
      poly.map((ring: number[][]) => ringToPath(ring)).join(" "),
    );
  }
  return [];
}

export function IndonesiaMap({ pins }: { pins: MapPin[] }) {
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [topoModule, worldModule] = await Promise.all([
          import("topojson-client"),
          import("world-atlas/countries-110m.json"),
        ]);
        const world: any = (worldModule as any).default ?? worldModule;
        const fc: any = topoModule.feature(world, world.objects.countries);
        const idn = fc.features.find(
          (f: any) =>
            String(f.id) === "360" || f.properties?.name === "Indonesia",
        );
        if (alive && idn) setPaths(geometryToPaths(idn.geometry));
      } catch {
        if (alive) setPaths([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const maxUnits = Math.max(1, ...pins.map((p) => p.units));

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-lg border border-border bg-bg-subtle/40 sm:h-72">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <g
          fill="var(--color-bg-elevated)"
          stroke="var(--color-border-strong)"
          strokeWidth="0.7"
          strokeLinejoin="round"
          fillRule="evenodd"
        >
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>

      {pins.map((pin) => {
        const [lon, lat] = cityCoord(pin.label, pin.label);
        const [x, y] = project(lon, lat);
        return (
          <div
            key={pin.id}
            className="group absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
          >
            <div className="flex flex-col items-center">
              <span className="whitespace-nowrap rounded-md border border-border bg-bg px-1.5 py-0.5 text-[10px] font-medium text-fg shadow-sm">
                {pin.label}
              </span>
              <span className="mt-1 block h-1.5 w-10 overflow-hidden rounded-full bg-bg-subtle">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.max(8, (pin.units / maxUnits) * 100)}%`,
                  }}
                />
              </span>
              <svg
                width="14"
                height="18"
                viewBox="0 0 14 18"
                className="mt-0.5"
                aria-hidden
              >
                <path
                  d="M7 0a7 7 0 0 0-7 7c0 5 7 11 7 11s7-6 7-11A7 7 0 0 0 7 0z"
                  fill="var(--color-accent)"
                />
                <circle cx="7" cy="7" r="2.6" fill="var(--color-bg)" />
              </svg>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted shadow-md group-hover:block">
              {pin.units.toLocaleString("id-ID")} units · {formatIDR(pin.value)}
            </div>
          </div>
        );
      })}

      {paths.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">
          Loading map geometry…
        </p>
      )}
      <p className="absolute bottom-1.5 right-2 text-[10px] text-fg-subtle">
        Natural Earth 1:110m · world-atlas
      </p>
    </div>
  );
}

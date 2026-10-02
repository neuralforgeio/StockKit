export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query);
  const t = normalize(target);
  if (q.length === 0) return 1;
  if (t.length === 0) return 0;
  const at = t.indexOf(q);
  if (at >= 0) return 100 - at;
  let cursor = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, cursor);
    if (found === -1) return 0;
    cursor = found + 1;
  }
  return Math.max(1, 50 - (t.length - q.length));
}

export function fuzzyMatch(
  query: string,
  fields: Array<string | null | undefined>,
): boolean {
  if (query.trim() === "") return true;
  return fields.some((f) => (f ? fuzzyScore(query, f) > 0 : false));
}

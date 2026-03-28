export function normKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

export function buildNormRow(row: Record<string, string>) {
  const n: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    n[normKey(k)] = v ?? "";
  }
  return n;
}

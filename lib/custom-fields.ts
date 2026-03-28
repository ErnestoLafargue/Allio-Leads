export function parseCustomFields(raw: string | null | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = typeof val === "string" ? val : String(val ?? "");
    }
    return out;
  } catch {
    return {};
  }
}

export function stringifyCustomFields(obj: Record<string, string>): string {
  return JSON.stringify(obj ?? {});
}

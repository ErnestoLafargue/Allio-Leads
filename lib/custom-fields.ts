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

const LEAD_DOMAIN_FIELD_KEYS = [
  "domaene",
  "domain",
  "hjemmeside",
  "website",
  "url",
  "webside",
] as const;

/** Første ikke-tomme domæne/hjemmeside fra leadets customFields. */
export function leadDomainFromCustomFields(raw: string | null | undefined): string {
  const custom = parseCustomFields(raw);
  for (const key of LEAD_DOMAIN_FIELD_KEYS) {
    const v = custom[key]?.trim();
    if (v) return v;
  }
  return "";
}

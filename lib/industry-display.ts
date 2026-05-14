import industryCodes from "@/lib/data/db-industry-codes.json";

const DB_INDUSTRY_CODES: Readonly<Record<string, string>> = industryCodes;

/** Udtrækker 6-cifret branchekode fra rå værdi (fx `031100`, `03.11.00`). */
export function extractIndustryCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dotted = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (dotted) return `${dotted[1]}${dotted[2]}${dotted[3]}`;

  const plain = trimmed.match(/^(\d{6})(?:\b|$)/);
  if (plain) return plain[1];

  return null;
}

function hasEmbeddedIndustryDescription(value: string, code: string): boolean {
  if (value === code) return false;
  const rest = value.slice(code.length).trimStart();
  return rest.length > 0 && /^[—|–\-]/.test(rest);
}

/** Visningslabel til branchefilter — filter-value forbliver uændret branchekode-streng. */
export function formatIndustryFilterLabel(
  value: string,
  dictionary: Readonly<Record<string, string>> = DB_INDUSTRY_CODES,
): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const code = extractIndustryCode(trimmed);
  if (!code) return trimmed;
  if (hasEmbeddedIndustryDescription(trimmed, code)) return trimmed;

  const description = dictionary[code];
  if (!description) return trimmed;
  return `${code} — ${description}`;
}

/** Memo-venligt opslag: rå kode → visningslabel. */
export function buildIndustryFilterLabelMap(
  values: readonly string[],
  dictionary: Readonly<Record<string, string>> = DB_INDUSTRY_CODES,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const value of values) {
    map.set(value, formatIndustryFilterLabel(value, dictionary));
  }
  return map;
}

/**
 * CVR til import og dubletkontrol — kun cifre, 8 tegn efter normalisering (dansk CVR).
 */

/** Trim, fjern mellemrum og ikke-cifre; kræver præcis 8 cifre. */
export function normalizeCVR(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = String(raw).trim().replace(/\s+/g, "").replace(/\D/g, "");
  if (digits.length !== 8) return null;
  return digits;
}

export function isValidCVR(raw: string | null | undefined): boolean {
  return normalizeCVR(raw) != null;
}

export type LeadCvrLookup = { id: string; campaignId: string | null; cvr: string; status: string };

/** Første lead pr. normaliseret CVR (til global opslag). */
export function indexLeadsByNormalizedCvr(
  leads: LeadCvrLookup[],
): Map<string, { id: string; campaignId: string | null; status: string }> {
  const map = new Map<string, { id: string; campaignId: string | null; status: string }>();
  for (const l of leads) {
    const key = normalizeCVR(l.cvr);
    if (!key || map.has(key)) continue;
    map.set(key, { id: l.id, campaignId: l.campaignId, status: l.status });
  }
  return map;
}

export type ImportDetailReason =
  | "duplicate_in_file"
  | "already_in_campaign"
  | "invalid_row";

export type ImportDetailRow = {
  dataRow: number;
  cvr: string;
  reason: ImportDetailReason;
  note?: string;
};

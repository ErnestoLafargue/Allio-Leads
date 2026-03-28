import { parseCustomFields } from "@/lib/custom-fields";

/** Forventet nøgle i `customFields` (case-insensitive match på nøglen). */
export const REKLAMEBESKYTTET_FIELD_KEY = "reklamebeskyttet";

/**
 * Læser værdi for reklamebeskyttet fra customFields JSON.
 * Sammenligning af værdi: trim + lowercase; kun «ja» tæller som beskyttet.
 */
export function getReklamebeskyttetNormalized(customFieldsJson: string): "ja" | "not_ja" {
  const cf = parseCustomFields(customFieldsJson);
  let raw = "";
  for (const [k, v] of Object.entries(cf)) {
    if (k.trim().toLowerCase() === REKLAMEBESKYTTET_FIELD_KEY) {
      raw = typeof v === "string" ? v : String(v ?? "");
      break;
    }
  }
  const t = raw.trim().toLowerCase();
  if (t === "ja") return "ja";
  return "not_ja";
}

/**
 * @param includeProtectedBusinesses true = medtag alle; false = eksplicit «ja» udelukkes (nej/tom/ukendt medtages).
 */
export function leadIncludedForCampaignProtectedSetting(
  customFieldsJson: string,
  includeProtectedBusinesses: boolean,
): boolean {
  if (includeProtectedBusinesses) return true;
  return getReklamebeskyttetNormalized(customFieldsJson) !== "ja";
}

export function filterLeadsByCampaignProtectedSetting<T extends { customFields: string }>(
  leads: T[],
  includeProtectedBusinesses: boolean,
): T[] {
  if (includeProtectedBusinesses) return leads;
  return leads.filter((l) =>
    leadIncludedForCampaignProtectedSetting(l.customFields, includeProtectedBusinesses),
  );
}

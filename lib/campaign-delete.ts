/** Beskyttede systemtyper — må aldrig slettes fra UI/API. */
export const PROTECTED_SYSTEM_CAMPAIGN_TYPES = [
  "upcoming_meetings",
  "rebooking",
  "active_customers",
] as const;

export type ProtectedSystemCampaignType = (typeof PROTECTED_SYSTEM_CAMPAIGN_TYPES)[number];

const PROTECTED_TYPE_SET = new Set<string>(PROTECTED_SYSTEM_CAMPAIGN_TYPES);

/** Eksakt navn (som i UI/seed) — fallback hvis flag ikke er sat endnu. */
export const PROTECTED_CAMPAIGN_NAMES = [
  "Kommende møder",
  "Genbook møder",
  "Aktive kunder",
] as const;

const PROTECTED_NAME_SET = new Set<string>(PROTECTED_CAMPAIGN_NAMES);

export type CampaignDeletionCheckInput = {
  name: string;
  isSystemCampaign?: boolean;
  systemCampaignType?: string | null;
};

export function isProtectedSystemCampaign(c: CampaignDeletionCheckInput): boolean {
  const t = c.systemCampaignType?.trim() ?? "";
  if (t && PROTECTED_TYPE_SET.has(t)) return true;
  if (PROTECTED_NAME_SET.has(c.name.trim())) return true;
  return false;
}

export function canDeleteCampaign(c: CampaignDeletionCheckInput): boolean {
  return !isProtectedSystemCampaign(c);
}

export const PROTECTED_CAMPAIGN_DELETE_MESSAGE =
  "Denne kampagne kan ikke slettes, da den bruges af systemets mødeflow.";

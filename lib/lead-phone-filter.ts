/**
 * @param includeLeadsWithoutPhone true = medtag alle; false = kun leads med mindst ét telefonnummer
 *   (virksomhed `phone` eller `privatePhone`).
 */
export function hasLeadPhone(phone: string): boolean {
  return typeof phone === "string" && phone.trim().length > 0;
}

export function leadHasDialablePhone(lead: {
  phone: string;
  privatePhone?: string | null;
}): boolean {
  return hasLeadPhone(lead.phone) || hasLeadPhone(lead.privatePhone ?? "");
}

export function leadIncludedForCampaignPhoneSetting(
  phone: string,
  includeLeadsWithoutPhone: boolean,
  privatePhone?: string | null,
): boolean {
  if (includeLeadsWithoutPhone) return true;
  return hasLeadPhone(phone) || hasLeadPhone(privatePhone ?? "");
}

export function filterLeadsByCampaignPhoneSetting<
  T extends { phone: string; privatePhone?: string | null },
>(leads: T[], includeLeadsWithoutPhone: boolean): T[] {
  if (includeLeadsWithoutPhone) return leads;
  return leads.filter((l) =>
    leadIncludedForCampaignPhoneSetting(l.phone, includeLeadsWithoutPhone, l.privatePhone),
  );
}

/**
 * @param includeLeadsWithoutPhone true = medtag alle; false = kun leads med ikke-tomt phone-felt.
 */
export function hasLeadPhone(phone: string): boolean {
  return typeof phone === "string" && phone.trim().length > 0;
}

export function leadIncludedForCampaignPhoneSetting(
  phone: string,
  includeLeadsWithoutPhone: boolean,
): boolean {
  if (includeLeadsWithoutPhone) return true;
  return hasLeadPhone(phone);
}

export function filterLeadsByCampaignPhoneSetting<T extends { phone: string }>(
  leads: T[],
  includeLeadsWithoutPhone: boolean,
): T[] {
  if (includeLeadsWithoutPhone) return leads;
  return leads.filter((l) =>
    leadIncludedForCampaignPhoneSetting(l.phone, includeLeadsWithoutPhone),
  );
}

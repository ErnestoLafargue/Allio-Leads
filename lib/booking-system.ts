/**
 * Bookingsystem — fast lead-felt under Virksomhedsnavn.
 *
 * Kampagner der er opkaldt efter et bookingsystem (Cbit, EasyPractice/Terapeutbooking, Gecko Booking,
 * Onlinebooq, Planway, Timma Booking)
 * giver leadet kampagnenavnet som standard. Øvrige kampagner (fx Hintly Leads) → tomt, så værdien
 * kommer fra import-mapping eller sælgeren.
 *
 * Holdes i sync med regex'en i migrationen `*_lead_booking_system` (backfill).
 */
const BOOKING_SYSTEM_CAMPAIGN_NAME_RE =
  /cbit|easy\s*practice|terapeut\s*booking|gecko|onlinebo(?:oq|ok)|planway|timma/i;

export function defaultBookingSystemForCampaign(
  campaign: { name: string; isSystemCampaign?: boolean | null } | null | undefined,
): string {
  if (!campaign || campaign.isSystemCampaign) return "";
  const name = campaign.name.trim();
  return BOOKING_SYSTEM_CAMPAIGN_NAME_RE.test(name) ? name : "";
}

/** Værdi fra fil/formular vinder; ellers kampagnens standard. */
export function resolveLeadBookingSystem(
  incoming: string | null | undefined,
  campaign: { name: string; isSystemCampaign?: boolean | null } | null | undefined,
): string {
  const v = (incoming ?? "").trim();
  return v || defaultBookingSystemForCampaign(campaign);
}

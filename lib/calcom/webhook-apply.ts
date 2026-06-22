import { prisma } from "@/lib/prisma";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import {
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
} from "@/lib/meeting-outcome";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { MOEDE_STATUS, updatePodioMeetingStatus } from "@/lib/podio/customer-mapping";

/**
 * Anvender Cal.eu-webhook-handlinger på et lead.
 *
 * Disse kaldes system-drevet (userId = null på aktivitetslog) når en kunde selv
 * aflyser, ombooker eller udebliver via Cal-linket.
 */

function formatMeetingTime(date: Date): string {
  return date.toLocaleString("da-DK", {
    timeZone: "Europe/Copenhagen",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export type CalRebookSource = "cancelled" | "no_show";

/**
 * Aflysning eller udeblivelse via Cal -> udfald "Genbook" + flyt til genbook-kampagnen.
 * Leadet beholder status MEETING_BOOKED, så det indgår i genbook-puljen.
 * Slot-blokeringen frigives automatisk (overlap tæller kun udfald PENDING).
 */
export async function applyCalRebook(
  leadId: string,
  opts: { source: CalRebookSource; reason?: string },
): Promise<void> {
  const rebookingCampaignId = await ensureSystemCampaignId("rebooking");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: MEETING_OUTCOME_REBOOK,
      campaignId: rebookingCampaignId,
    },
  });

  const reasonSuffix = opts.reason?.trim() ? ` Årsag: ${opts.reason.trim()}.` : "";
  const summary =
    opts.source === "no_show"
      ? `Kunden udeblev fra mødet (Cal.eu) — sat til Genbook.${reasonSuffix}`
      : `Kunden aflyste mødet via Cal.eu — sat til Genbook.${reasonSuffix}`;

  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary,
    },
  });

  // Spejl møde-status i Podio (ikke-fatal, no-op hvis Podio ikke er konfigureret).
  await updatePodioMeetingStatus(leadId, { status: MOEDE_STATUS.genbook });
}

/**
 * Ombooking via Cal -> ny mødetid + nyt Meet-link.
 * Gammel tid frigives automatisk (meetingScheduledFor ændres), ny tid optages.
 * Udfald sættes til Afventende og leadet routes til "Kommende møder".
 */
export async function applyCalReschedule(
  leadId: string,
  opts: { newStart: Date; newUid: string; meetingUrl: string | null },
): Promise<void> {
  const upcomingCampaignId = await ensureSystemCampaignId("upcoming_meetings");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: MEETING_OUTCOME_PENDING,
      meetingScheduledFor: opts.newStart,
      calComBookingUid: opts.newUid,
      ...(opts.meetingUrl ? { calComMeetingUrl: opts.meetingUrl } : {}),
      campaignId: upcomingCampaignId,
    },
  });

  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: `Kunden ombookede mødet via Cal.eu til ${formatMeetingTime(opts.newStart)}.`,
    },
  });

  // Spejl ny dato/link + status i Podio (ikke-fatal, no-op hvis ikke konfigureret).
  await updatePodioMeetingStatus(leadId, {
    status: MOEDE_STATUS.booket,
    newStart: opts.newStart,
    meetingUrl: opts.meetingUrl,
  });
}

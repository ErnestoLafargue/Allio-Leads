import { prisma } from "@/lib/prisma";
import { ensureSystemCampaignId } from "@/lib/ensure-system-campaigns";
import {
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
} from "@/lib/meeting-outcome";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  handleOnboardingMeetingCancelled,
  MOEDE_STATUS,
  updatePodioMeetingStatus,
} from "@/lib/podio/customer-mapping";

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
 *
 * I Podio spejles møde-status som "Aflyst" (kunden aflyste/udeblev). Sælgeren kan
 * manuelt sætte Podio-status til "Genbook" senere — det er en separat handling der
 * IKKE ændrer noget i Allio (leadet ligger allerede i Genbook-kampagnen).
 *
 * mirrorToPodio=false bruges når kaldet selv kommer FRA Podio (Podio→Allio), så vi
 * ikke skriver tilbage til Podio og skaber en løkke.
 */
export async function applyCalRebook(
  leadId: string,
  opts: { source: CalRebookSource; reason?: string; mirrorToPodio?: boolean },
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

  // Spejl møde-status i Podio som "Aflyst" (ikke-fatal, no-op hvis ikke konfigureret).
  if (opts.mirrorToPodio !== false) {
    await updatePodioMeetingStatus(leadId, { status: MOEDE_STATUS.aflyst });
  }

  // Onboarding (Cal uid på lead) — slet processer og sæt kunde til Tabt/Annulleret.
  await handleOnboardingMeetingCancelled(leadId);
}

/**
 * Podio → Allio: flyt et lead til Genbook-kampagnen (kun additivt).
 *
 * Kaldes når en sælger manuelt sætter Podio Møde-status til "Genbook". Opdaterer
 * KUN Allio (skriver aldrig tilbage til Podio). Idempotent: hvis leadet allerede
 * er REBOOK i genbook-kampagnen, gøres intet. Fjerner aldrig et lead fra Genbook.
 *
 * Returnerer true hvis leadet blev flyttet, false hvis det allerede lå korrekt.
 */
export async function moveLeadToRebooking(leadId: string): Promise<boolean> {
  const rebookingCampaignId = await ensureSystemCampaignId("rebooking");

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true, meetingOutcomeStatus: true, campaignId: true },
  });
  if (!lead) return false;

  // Allerede i Genbook-kampagnen med Genbook-udfald → no-op (idempotent).
  if (
    lead.status === "MEETING_BOOKED" &&
    lead.meetingOutcomeStatus === MEETING_OUTCOME_REBOOK &&
    lead.campaignId === rebookingCampaignId
  ) {
    return false;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: "MEETING_BOOKED",
      meetingOutcomeStatus: MEETING_OUTCOME_REBOOK,
      campaignId: rebookingCampaignId,
    },
  });

  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: "Møde sat til Genbook i Podio — flyttet til genbook-kampagnen i Allio.",
    },
  });

  return true;
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

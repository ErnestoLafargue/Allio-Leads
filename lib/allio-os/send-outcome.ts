import { createHmac } from "node:crypto";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelAllioNativeBookingForLead } from "@/lib/allio-native/sync-lead-booking";
import {
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_IN_PROGRESS,
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
  normalizeMeetingOutcomeStatus,
} from "@/lib/meeting-outcome";
import type { AllioOsOutcome } from "@/lib/allio-os/meeting-outcome";

/** Allio OS' modtager (Supabase edge function). Kan overskrives med ALLIO_OS_OUTCOME_URL. */
const DEFAULT_OUTCOME_URL = "https://fdidsxwmadvfxitqjdez.supabase.co/functions/v1/os-leads-outcome";

/**
 * Leads-udfald → Allio OS. Afholdt uden udfald er "intet udfald" i Allio OS. Ej mødt (CANCELLED) findes ikke
 * i Allio OS og sendes ikke.
 */
const TO_ALLIO_OS: Record<string, AllioOsOutcome> = {
  [MEETING_OUTCOME_SALE]: "salg",
  [MEETING_OUTCOME_IN_PROGRESS]: "afventer",
  [MEETING_OUTCOME_LOST]: "tabt",
  [MEETING_OUTCOME_REBOOK]: "genbook",
  [MEETING_OUTCOME_PENDING]: null,
  [MEETING_OUTCOME_HELD]: null,
};

export function allioOsOutcomeFor(meetingOutcomeStatus: string | null | undefined): AllioOsOutcome | undefined {
  const normalized = normalizeMeetingOutcomeStatus(meetingOutcomeStatus);
  return normalized in TO_ALLIO_OS ? TO_ALLIO_OS[normalized] : undefined;
}

/** Signaturen Allio OS tjekker: "sha256=<hex>" af "<timestamp>.<body>" med ALLIO_OS_LEADS_SECRET. */
export function signAllioOsBody(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Send leadets nuværende mødeudfald til Allio OS (Salg-menuen). Kun møder, der ligger i Allios kalender.
 * Fejl logges og kastes ikke — udfaldet er gemt i Leads uanset hvad.
 */
export async function sendOutcomeToAllioOs(leadId: string): Promise<void> {
  const secret = (process.env.ALLIO_OS_LEADS_SECRET ?? "").trim();
  if (!secret) return;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { allioBookingId: true, meetingOutcomeStatus: true },
  });
  if (!lead?.allioBookingId) return;
  const outcome = allioOsOutcomeFor(lead.meetingOutcomeStatus);
  if (outcome === undefined) return;

  const url = (process.env.ALLIO_OS_OUTCOME_URL ?? DEFAULT_OUTCOME_URL).trim();
  const body = JSON.stringify({ booking_id: lead.allioBookingId, lead_id: leadId, outcome });
  const timestamp = String(Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-allio-leads-timestamp": timestamp,
        "x-allio-leads-signature": signAllioOsBody(secret, timestamp, body),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[allio-os] udfald for lead=${leadId} afvist: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error(`[allio-os] udfald for lead=${leadId} kunne ikke sendes:`, err instanceof Error ? err.message : err);
  }
}

/** Er mødet sat til Genbook, aflyses bookingen i Allios kalender (kunden får ingen besked). */
export async function cancelAllioBookingIfRebooked(leadId: string): Promise<void> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { allioBookingId: true, meetingOutcomeStatus: true },
  });
  if (!lead?.allioBookingId) return;
  if (normalizeMeetingOutcomeStatus(lead.meetingOutcomeStatus) !== MEETING_OUTCOME_REBOOK) return;
  try {
    await cancelAllioNativeBookingForLead(leadId);
  } catch (err) {
    console.error(`[allio-native] aflysning ved Genbook fejlede lead=${leadId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Leads-udfaldet videre til Allio: til Allio OS' Salg-menu (ikke når udfaldet kom derfra), og ved Genbook aflyses
 * bookingen i Allio bagefter, så mødet forsvinder fra kalenderen og fra Salg. Udfaldet sendes først, mens Allio OS
 * stadig kan finde mødet på bookingen.
 */
export async function shareOutcomeWithAllio(leadId: string, opts: { fromAllioOs?: boolean } = {}): Promise<void> {
  if (!opts.fromAllioOs) await sendOutcomeToAllioOs(leadId);
  await cancelAllioBookingIfRebooked(leadId);
}

/** Som shareOutcomeWithAllio, men efter svaret, så brugeren ikke venter. */
export function shareOutcomeWithAllioAfterResponse(leadId: string): void {
  after(() => shareOutcomeWithAllio(leadId));
}

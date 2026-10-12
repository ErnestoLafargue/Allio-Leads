/**
 * Automatisk hentning af manglende Telnyx-optagelser.
 *
 * Triggers (møde booket / samtale ≥ 60 s) kalder `scheduleLeadRecordingSync`,
 * som venter kort (så Telnyx når at gemme filen) og kører per-lead backfill.
 * Hard rule: «Møde booket» henter ALLE optagelser (ingen skip, ingen 14-dages grænse).
 * Cron bruger `findLeadsNeedingRecordingSync` til at genfinde gamle mangler.
 */
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import { runRecordingsBackfillForLead } from "@/lib/telnyx-recordings-backfill";

export const MIN_TALK_SECONDS_FOR_AUTO_SYNC = 60;
export const AUTO_SYNC_LOOKBACK_DAYS = 14;
export const AUTO_SYNC_DELAY_MS = 25_000;
export const AUTO_SYNC_CRON_LIMIT = 20;

const MEETING_BOOKED_REASON = "meeting_booked";

/** Hard rule: møde-booket henter ALLE optagelser — ingen skip og ingen lookback-grænse. */
export function isMeetingBookedRecordingReason(reason: string): boolean {
  return (
    reason === MEETING_BOOKED_REASON ||
    reason.startsWith(`${MEETING_BOOKED_REASON}:`) ||
    reason === "cron:meeting_booked"
  );
}

export function shouldSkipIfLeadAlreadyHasRecording(reason: string): boolean {
  return !isMeetingBookedRecordingReason(reason);
}

export function recordingSyncFromIso(reason: string, nowMs = Date.now()): string | null {
  if (isMeetingBookedRecordingReason(reason)) return null;
  return new Date(nowMs - AUTO_SYNC_LOOKBACK_DAYS * 86400000).toISOString();
}

/** Talk-tid i sekunder fra DialerCallLog-tidsstempler (0 hvis mangler). */
export function talkSecondsFromCallTimestamps(params: {
  endedAt: Date | null | undefined;
  bridgedAt?: Date | null | undefined;
  answeredAt?: Date | null | undefined;
}): number {
  const end = params.endedAt?.getTime();
  if (end == null || !Number.isFinite(end)) return 0;
  const start =
    params.bridgedAt?.getTime() ??
    params.answeredAt?.getTime() ??
    null;
  if (start == null || !Number.isFinite(start) || end < start) return 0;
  return Math.floor((end - start) / 1000);
}

export function meetsAutoSyncTalkThreshold(talkSeconds: number): boolean {
  return talkSeconds >= MIN_TALK_SECONDS_FOR_AUTO_SYNC;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** True hvis leadet allerede har en afspilbar CALL_RECORDING. */
export async function leadHasPlayableRecording(leadId: string): Promise<boolean> {
  const row = await prisma.leadActivityEvent.findFirst({
    where: {
      leadId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
      NOT: { recordingUrl: "" },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Kør per-lead Telnyx-backfill (uden delay).
 * Ved møde booket hentes ALLE optagelser (ingen skip, ingen 14-dages grænse).
 * Øvrige triggers skipper hvis leadet allerede har en afspilbar fil.
 */
export async function syncLeadRecordingsNow(
  leadId: string,
  reason: string,
): Promise<{ skipped: boolean; ok: boolean; message?: string }> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`[recordings-auto-sync] skip lead=${leadId} reason=${reason}: no TELNYX_API_KEY`);
    return { skipped: true, ok: false, message: "no_api_key" };
  }

  const meetingBooked = isMeetingBookedRecordingReason(reason);
  if (!meetingBooked && (await leadHasPlayableRecording(leadId))) {
    console.log(`[recordings-auto-sync] skip lead=${leadId} reason=${reason}: already_has_recording`);
    return { skipped: true, ok: true, message: "already_has_recording" };
  }

  const fromIso = recordingSyncFromIso(reason);
  console.log(`[recordings-auto-sync] sync lead=${leadId} reason=${reason} forceAll=${meetingBooked}`);

  let sessionBatchStart = 0;
  let created = 0;
  let updated = 0;
  let matched = 0;
  for (;;) {
    const out = await runRecordingsBackfillForLead({
      apiKey,
      leadId,
      pageSize: 100,
      fromIso,
      toIso: null,
      dryRun: false,
      copyToBlob: true,
      maxSessionQueries: meetingBooked ? 40 : 25,
      sessionBatchStart,
      maxPhonePages: meetingBooked ? 8 : 4,
      includePhoneFilters: sessionBatchStart === 0,
    });

    if (!out.ok) {
      console.error(
        `[recordings-auto-sync] failed lead=${leadId} reason=${reason}: ${out.message}`,
      );
      return { skipped: false, ok: false, message: out.message };
    }

    created += out.result.stats.created;
    updated += out.result.stats.updated;
    matched += out.result.stats.matched;

    if (!meetingBooked || out.result.nextSessionBatchStart == null) break;
    sessionBatchStart = out.result.nextSessionBatchStart;
  }

  console.log(
    `[recordings-auto-sync] done lead=${leadId} reason=${reason} created=${created} updated=${updated} matched=${matched}`,
  );
  return { skipped: false, ok: true };
}

/**
 * Planlæg sync efter HTTP-svar (Next.js `after`) med kort delay, så Telnyx
 * typisk har gemt optagelsen efter hangup.
 */
export function scheduleLeadRecordingSync(leadId: string, reason: string): void {
  const id = leadId.trim();
  if (!id) return;

  after(() => {
    void (async () => {
      try {
        await sleep(AUTO_SYNC_DELAY_MS);
        await syncLeadRecordingsNow(id, reason);
      } catch (err) {
        console.error(
          `[recordings-auto-sync] exception lead=${id} reason=${reason}:`,
          err instanceof Error ? err.message : err,
        );
      }
    })();
  });
}

/**
 * Hard rule: når et lead sættes til «Møde booket», skal ALLE lydfiler hentes
 * fra Telnyx og ligge i Allio (Blob + CALL_RECORDING).
 */
export function scheduleMeetingBookedRecordings(leadId: string): void {
  scheduleLeadRecordingSync(leadId, MEETING_BOOKED_REASON);
}

export async function syncRecentMeetingBookedRecordings(limit = 15): Promise<{
  leads: {
    id: string;
    companyName: string;
    meetingBookedAt: string | null;
    ok: boolean;
    skipped: boolean;
    message?: string;
  }[];
}> {
  const take = Math.min(50, Math.max(1, limit));
  const rows = await prisma.lead.findMany({
    where: { status: "MEETING_BOOKED" },
    orderBy: { meetingBookedAt: "desc" },
    take,
    select: { id: true, companyName: true, meetingBookedAt: true },
  });

  const leads: {
    id: string;
    companyName: string;
    meetingBookedAt: string | null;
    ok: boolean;
    skipped: boolean;
    message?: string;
  }[] = [];

  for (const row of rows) {
    const result = await syncLeadRecordingsNow(row.id, `${MEETING_BOOKED_REASON}:backfill`);
    leads.push({
      id: row.id,
      companyName: row.companyName,
      meetingBookedAt: row.meetingBookedAt?.toISOString() ?? null,
      ok: result.ok,
      skipped: result.skipped,
      message: result.message,
    });
  }

  return { leads };
}

export type RecordingSyncCandidate = {
  leadId: string;
  sortAt: number;
  source: "meeting_booked" | "long_call";
};

/**
 * Find leads der mangler afspilbar optagelse, og som enten er mødebooket
 * eller har haft en samtale ≥ 60 s inden for lookback-vinduet.
 */
export async function findLeadsNeedingRecordingSync(params?: {
  limit?: number;
  lookbackDays?: number;
  now?: Date;
}): Promise<RecordingSyncCandidate[]> {
  const limit = Math.min(50, Math.max(1, params?.limit ?? AUTO_SYNC_CRON_LIMIT));
  const lookbackDays = Math.min(60, Math.max(1, params?.lookbackDays ?? AUTO_SYNC_LOOKBACK_DAYS));
  const now = params?.now ?? new Date();
  const since = new Date(now.getTime() - lookbackDays * 86400000);

  const [bookedLeads, longCalls] = await Promise.all([
    prisma.lead.findMany({
      where: {
        status: "MEETING_BOOKED",
        meetingBookedAt: { gte: since },
      },
      select: { id: true, meetingBookedAt: true },
      orderBy: { meetingBookedAt: "desc" },
      take: 100,
    }),
    prisma.dialerCallLog.findMany({
      where: {
        leadId: { not: null },
        endedAt: { gte: since },
        OR: [{ bridgedAt: { not: null } }, { answeredAt: { not: null } }],
      },
      select: {
        leadId: true,
        endedAt: true,
        bridgedAt: true,
        answeredAt: true,
        recordingUrl: true,
      },
      orderBy: { endedAt: "desc" },
      take: 200,
    }),
  ]);

  const byLead = new Map<string, RecordingSyncCandidate>();

  for (const lead of bookedLeads) {
    byLead.set(lead.id, {
      leadId: lead.id,
      sortAt: lead.meetingBookedAt?.getTime() ?? 0,
      source: "meeting_booked",
    });
  }

  for (const call of longCalls) {
    if (!call.leadId) continue;
    const talk = talkSecondsFromCallTimestamps({
      endedAt: call.endedAt,
      bridgedAt: call.bridgedAt,
      answeredAt: call.answeredAt,
    });
    if (!meetsAutoSyncTalkThreshold(talk)) continue;
    // Mangler URL på loggen, eller lead mangler evt. CALL_RECORDING — begge går videre
    // til hasPlayable-check nedenfor. Long-call uden recordingUrl prioriteres.
    const sortAt = call.endedAt?.getTime() ?? 0;
    const existing = byLead.get(call.leadId);
    if (!existing || sortAt > existing.sortAt) {
      byLead.set(call.leadId, {
        leadId: call.leadId,
        sortAt,
        source: "long_call",
      });
    } else if (existing.source === "meeting_booked" && !call.recordingUrl) {
      // Behold meeting_booked, men opdatér ikke sort — allerede booket
    }
  }

  const candidates = [...byLead.values()].sort((a, b) => b.sortAt - a.sortAt);

  const needing: RecordingSyncCandidate[] = [];
  for (const c of candidates) {
    if (needing.length >= limit) break;
    if (await leadHasPlayableRecording(c.leadId)) continue;
    needing.push(c);
  }
  return needing;
}

/**
 * Cron: sync en batch af leads der mangler optagelser.
 */
export async function syncMissingRecordingsBatch(params?: {
  limit?: number;
}): Promise<{
  found: number;
  synced: number;
  skipped: number;
  failed: number;
  leadIds: string[];
}> {
  const candidates = await findLeadsNeedingRecordingSync({
    limit: params?.limit ?? AUTO_SYNC_CRON_LIMIT,
  });

  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of candidates) {
    const result = await syncLeadRecordingsNow(c.leadId, `cron:${c.source}`);
    if (result.skipped) skipped += 1;
    else if (result.ok) synced += 1;
    else failed += 1;
  }

  return {
    found: candidates.length,
    synced,
    skipped,
    failed,
    leadIds: candidates.map((c) => c.leadId),
  };
}

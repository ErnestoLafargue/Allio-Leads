import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { mergeBackfillStats, runRecordingsBackfillForLead } from "@/lib/telnyx-recordings-backfill";
import type { BackfillStats } from "@/lib/telnyx-recordings-backfill";

type Params = { params: Promise<{ id: string }> };

const MAX_SESSION_ROUNDS = 12;

/**
 * POST /api/leads/[id]/sync-telnyx-recordings
 *
 * Henter Telnyx-optagelser målrettet via DialerCallLog-sessioner og lead-telefon
 * (filter[to]/[from]), samme kerne som admin-backfill.
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id: leadId } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      campaignId: true,
      status: true,
      bookedByUserId: true,
      callbackReservedByUserId: true,
      importedAt: true,
      createdAt: true,
    },
  });
  if (!lead) return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });

  if (!canAccessCallbackLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }
  if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Ingen adgang." }, { status: 403 });
  }

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Telnyx er ikke konfigureret (TELNYX_API_KEY)." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        daysBack?: number;
        copyToBlob?: boolean;
        maxSessionQueries?: number;
        sessionBatchStart?: number;
        maxPhonePages?: number;
        /** @deprecated brug maxPhonePages */
        maxPages?: number;
      }
    | null;

  const daysBack = Math.min(730, Math.max(1, Math.floor(Number(body?.daysBack) || 120)));
  const copyToBlob = body?.copyToBlob !== false;
  const maxSessionQueries = Math.min(80, Math.max(1, Math.floor(Number(body?.maxSessionQueries) || 35)));
  const maxPhonePages = Math.min(
    20,
    Math.max(1, Math.floor(Number(body?.maxPhonePages ?? body?.maxPages) || 8)),
  );

  const fromIso = new Date(Date.now() - daysBack * 86400000).toISOString();

  let sessionBatchStart = Math.max(0, Math.floor(Number(body?.sessionBatchStart) || 0));
  let mergedStats: BackfillStats | null = null;
  let pagesProcessed = 0;
  let totalPages: number | null = null;
  let totalSessions = 0;
  let nextSessionBatchStart: number | null = null;

  for (let round = 0; round < MAX_SESSION_ROUNDS; round++) {
    const out = await runRecordingsBackfillForLead({
      apiKey,
      leadId,
      pageSize: 100,
      fromIso,
      toIso: null,
      dryRun: false,
      copyToBlob,
      maxSessionQueries,
      sessionBatchStart,
      maxPhonePages,
      includePhoneFilters: round === 0,
    });

    if (!out.ok) {
      return NextResponse.json(
        { ok: false, error: out.message },
        { status: out.status >= 400 && out.status < 600 ? out.status : 502 },
      );
    }

    mergedStats = mergedStats
      ? mergeBackfillStats(mergedStats, out.result.stats)
      : out.result.stats;
    pagesProcessed += out.result.pagesProcessed;
    totalPages = out.result.totalPages ?? totalPages;
    totalSessions = out.result.totalSessions;
    nextSessionBatchStart = out.result.nextSessionBatchStart;

    if (nextSessionBatchStart == null) break;
    sessionBatchStart = nextSessionBatchStart;
  }

  return NextResponse.json({
    ok: true,
    leadId,
    daysBack,
    maxSessionQueries,
    maxPhonePages,
    stats: mergedStats!,
    pagesProcessed,
    totalPages,
    totalSessions,
    nextSessionBatchStart,
    nextPage: null,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

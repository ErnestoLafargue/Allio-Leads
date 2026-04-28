import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { runRecordingsBackfillForLead } from "@/lib/telnyx-recordings-backfill";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/[id]/sync-telnyx-recordings
 *
 * Henter et udsnit af Telnyx-optagelser og knytter dem til dette lead (samme logik som admin-backfill),
 * så historiske opkald der aldrig fik webhook kan vises under Aktivitet.
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
    | { maxPages?: number; daysBack?: number; copyToBlob?: boolean }
    | null;

  const maxPages = Math.min(10, Math.max(1, Math.floor(Number(body?.maxPages) || 3)));
  const daysBack = Math.min(365, Math.max(1, Math.floor(Number(body?.daysBack) || 90)));
  const copyToBlob = body?.copyToBlob !== false;

  const fromIso = new Date(Date.now() - daysBack * 86400000).toISOString();

  const out = await runRecordingsBackfillForLead({
    apiKey,
    leadId,
    startPage: 1,
    pageSize: 100,
    maxPages,
    fromIso,
    toIso: null,
    dryRun: false,
    copyToBlob,
  });

  if (!out.ok) {
    return NextResponse.json(
      { ok: false, error: out.message },
      { status: out.status >= 400 && out.status < 600 ? out.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    leadId,
    daysBack,
    maxPages,
    stats: out.result.stats,
    nextPage: out.result.nextPage,
    totalPages: out.result.totalPages,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

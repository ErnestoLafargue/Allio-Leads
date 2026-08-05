import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

/** Afvis åbenlyst korrupte klient-tal (fx frossen fane der vågner dagen efter). */
const MAX_TALK_SECONDS = 6 * 60 * 60;
/** Find opkaldets CALL_ATTEMPT inden for dette vindue (matcher scoreboardets kontakt-bucket). */
const ATTEMPT_LOOKBACK_MS = 2 * 60 * 60 * 1000;

/**
 * POST /api/telnyx/webrtc/log-call-result
 *
 * WebRTC-opkald (click-to-call/predictive) går uden om Call Control-webhooks, så
 * serveren kender ikke den forbundne taletid. Klienten (campaign-voip-strip)
 * rapporterer den her når et opkald med live-tale lukkes, og vi gemmer den på
 * det seneste CALL_ATTEMPT for samme bruger+lead. Scoreboardet tæller samtaler
 * (≥ 20 s) ud fra `durationSeconds`.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const rawSeconds = body?.connectedTalkSeconds;
  const seconds =
    typeof rawSeconds === "number" && Number.isFinite(rawSeconds)
      ? Math.round(rawSeconds)
      : null;
  if (!leadId || seconds === null || seconds <= 0 || seconds > MAX_TALK_SECONDS) {
    return NextResponse.json(
      { error: "leadId og connectedTalkSeconds (1 s – 6 t) er påkrævet" },
      { status: 400 },
    );
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
  }

  const since = new Date(Date.now() - ATTEMPT_LOOKBACK_MS);
  const attempt = await prisma.leadActivityEvent.findFirst({
    where: {
      leadId,
      userId: session.user.id,
      kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, durationSeconds: true },
  });

  if (attempt) {
    // Idempotent: gentagne luk-rapporter må aldrig nedskrive en allerede gemt
    // (længere) taletid for samme opkald.
    if (attempt.durationSeconds == null || seconds > attempt.durationSeconds) {
      await prisma.leadActivityEvent.update({
        where: { id: attempt.id },
        data: { durationSeconds: seconds },
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Intet CALL_ATTEMPT fundet (fx server-bridged opkald uden log-attempt) —
  // opret ét med taletiden så både kontakt og samtale tælles.
  const durationLabel = `${Math.floor(seconds / 60)}:${(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: session.user.id,
      kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT,
      summary: `Samtale afsluttet — varighed ${durationLabel}`,
      durationSeconds: seconds,
    },
  });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";
export const maxDuration = 30;

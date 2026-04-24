import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";

/**
 * Heartbeat / presence-status fra agent-workspaces. Klienten kalder denne hver 5-10 sek
 * for at fortælle serveren at agenten er "ready" til at modtage et bridged opkald.
 *
 * POST {
 *   campaignId: string,
 *   status: "ready" | "ringing" | "talking" | "wrap_up" | "offline"
 * }
 *
 * Server upsert'er AgentSession (én pr. (userId, campaignId)) og opdaterer lastHeartbeat.
 */

const ALLOWED_STATUSES = new Set(["ready", "ringing", "talking", "wrap_up", "offline"]);

export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaignId === "string" ? body.campaignId.trim() : "";
  const status = typeof body?.status === "string" ? body.status.trim() : "";

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId er påkrævet" }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Ugyldig status (skal være én af: ${[...ALLOWED_STATUSES].join(", ")})` },
      { status: 400 },
    );
  }

  // Hvis vi sender "offline" → slet sessionen helt så den ikke fylder i pacing-aggregater.
  if (status === "offline") {
    await prisma.agentSession.deleteMany({
      where: { userId, campaignId },
    });
    return NextResponse.json({ ok: true, status: "offline" });
  }

  // Sørg for at brugerens telnyxSipUsername er sat — uden det kan dispatcher ikke ringe agenten op.
  // Vi blokerer ikke heartbeat, men sender en advarsel tilbage så frontend kan vise det.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telnyxSipUsername: true, telnyxCredentialId: true },
  });
  const sipReady = Boolean(user?.telnyxSipUsername && user?.telnyxCredentialId);

  // Upsert med raw SQL via prisma er ikke nødvendigt — vi har @@unique([userId, campaignId])
  const existing = await prisma.agentSession.findUnique({
    where: { userId_campaignId: { userId, campaignId } },
    select: { id: true, status: true },
  });

  if (existing) {
    await prisma.agentSession.update({
      where: { id: existing.id },
      data: {
        status,
        // updateAt @updatedAt opdaterer lastHeartbeat automatisk pga @updatedAt-direktivet
      },
    });
  } else {
    await prisma.agentSession.create({
      data: { userId, campaignId, status },
    });
  }

  // Returnér antal aktive ready agenter + in-flight opkald så klienten kan vise pacing-info
  const cutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const [readyCount, ringingCount, talkingCount, inFlightCalls, mySession] = await Promise.all([
    prisma.agentSession.count({
      where: { campaignId, status: "ready", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "ringing", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.agentSession.count({
      where: { campaignId, status: "talking", lastHeartbeat: { gte: cutoff } },
    }),
    prisma.dialerCallLog.count({
      where: {
        campaignId,
        direction: "outbound-lead",
        state: { in: ["initiated", "ringing", "answered"] },
        endedAt: null,
      },
    }),
    prisma.agentSession.findUnique({
      where: { userId_campaignId: { userId, campaignId } },
      select: {
        status: true,
        currentLeadId: true,
        currentLeadCallControlId: true,
        currentAgentCallControlId: true,
      },
    }),
  ]);

  // Hvis dispatcheren har tildelt et bridged lead → returnér lead-data så frontend
  // kan loade det. Browser detekterer ændring i `assignedLeadId` og navigerer.
  let assignedLead: {
    id: string;
    companyName: string;
    phone: string;
    leadCallControlId: string | null;
    agentCallControlId: string | null;
  } | null = null;
  if (
    mySession &&
    (mySession.status === "ringing" || mySession.status === "talking") &&
    mySession.currentLeadId
  ) {
    const lead = await prisma.lead.findUnique({
      where: { id: mySession.currentLeadId },
      select: { id: true, companyName: true, phone: true, campaignId: true },
    });
    if (lead && lead.campaignId === campaignId) {
      assignedLead = {
        id: lead.id,
        companyName: lead.companyName,
        phone: lead.phone,
        leadCallControlId: mySession.currentLeadCallControlId,
        agentCallControlId: mySession.currentAgentCallControlId,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    status,
    sipReady,
    presence: {
      ready: readyCount,
      ringing: ringingCount,
      talking: talkingCount,
      inFlightCalls,
    },
    assignedLead,
    serverStatus: mySession?.status ?? null,
  });
}

export async function DELETE() {
  const { session, response } = await requireSession();
  if (response) return response;
  await prisma.agentSession.deleteMany({
    where: { userId: session!.user.id },
  });
  return NextResponse.json({ ok: true });
}

export const runtime = "nodejs";

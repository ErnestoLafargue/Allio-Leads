import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { normalizeCampaignDialMode, campaignUsesVoipUi } from "@/lib/dial-mode";
import { LEAD_ACTIVITY_KIND, maskPhoneForActivity } from "@/lib/lead-activity-kinds";

async function logCallAttempt(leadId: string, userId: string, summary: string) {
  try {
    await prisma.leadActivityEvent.create({
      data: { leadId, userId, kind: LEAD_ACTIVITY_KIND.CALL_ATTEMPT, summary },
    });
  } catch {
    /* aktivitet må ikke blokere opkaldssvar */
  }
}

/**
 * Starter browser-opkald mod et lead via Telnyx (WebRTC / Call Control).
 * MVP: validerer session, kampagne-dial mode og returnerer struktureret svar —
 * fuld Telnyx WebRTC-token + opkaldsoprettelse tilføjes når integrationen er klar.
 */
export async function POST(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const toNumber = typeof body?.toNumber === "string" ? body.toNumber.trim() : "";
  if (!leadId) {
    return NextResponse.json({ error: "leadId er påkrævet" }, { status: 400 });
  }
  if (!toNumber) {
    return NextResponse.json({ error: "Telefonnummer mangler" }, { status: 400 });
  }

  await releaseExpiredLocksEverywhere(prisma);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      campaign: { select: { id: true, dialMode: true } },
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead findes ikke" }, { status: 404 });
  }

  const masked = maskPhoneForActivity(toNumber);
  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (!campaignUsesVoipUi(mode)) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — kampagnen bruger ikke VoIP.`,
    );
    return NextResponse.json(
      { error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." },
      { status: 409 },
    );
  }

  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — leadet er låst af en anden bruger.`,
    );
    return NextResponse.json(
      { error: "Leadet er låst af en anden bruger — du kan ikke starte opkald." },
      { status: 409 },
    );
  }

  if (!process.env.TELNYX_API_KEY?.trim()) {
    await logCallAttempt(
      leadId,
      session.user.id,
      `Opkald til ${masked} ikke startet — Telnyx er ikke konfigureret.`,
    );
    return NextResponse.json(
      {
        ok: false,
        code: "TELNYX_NOT_CONFIGURED",
        message:
          "Telnyx er ikke konfigureret (mangler TELNYX_API_KEY). Når nøglen og WebRTC er på plads, fortsætter opkaldet herfra.",
      },
      { status: 503 },
    );
  }

  await logCallAttempt(
    leadId,
    session.user.id,
    `Opkald til ${masked} ikke startet — server-integration mangler endnu.`,
  );
  return NextResponse.json(
    {
      ok: false,
      code: "TELNYX_CALL_NOT_IMPLEMENTED",
      message:
        "Telnyx-nøgle er sat, men server-side opkalds/WebRTC-session er endnu ikke koblet på. Brug webhook + Call Control som beskrevet i jeres Telnyx-setup.",
      dialMode: mode,
    },
    { status: 501 },
  );
}

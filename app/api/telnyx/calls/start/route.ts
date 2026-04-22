import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { releaseExpiredLocksEverywhere, sellerMayEditLead } from "@/lib/lead-lock";
import { normalizeCampaignDialMode, campaignUsesVoipUi } from "@/lib/dial-mode";

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

  const mode = normalizeCampaignDialMode(lead.campaign?.dialMode);
  if (!campaignUsesVoipUi(mode)) {
    return NextResponse.json(
      { error: "Kampagnen er ikke sat til et opkalds-mode (VoIP)." },
      { status: 409 },
    );
  }

  if (!sellerMayEditLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json(
      { error: "Leadet er låst af en anden bruger — du kan ikke starte opkald." },
      { status: 409 },
    );
  }

  if (!process.env.TELNYX_API_KEY?.trim()) {
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

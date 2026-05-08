import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/leads/[id]/status
 *
 * Letvægts-endpoint der kun returnerer leadets `status` + tidspunkter relateret
 * til seneste udfald. Bruges af `campaign-workspace` til at polle om en server-side
 * AMD-detektion (predictive) har sat status fra NEW → VOICEMAIL/NOT_HOME, så
 * workspace kan rykke videre uden at vente på 25-sek timeout.
 *
 * Holdes bevidst minimal (ingen lead-cooldown / lock-cleanup) så den kan kaldes
 * hver 2-3 sek under et igangværende predictive-opkald uden at belaste DB.
 */
export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      lastOutcomeAt: true,
      voicemailMarkedAt: true,
      notHomeMarkedAt: true,
    },
  });
  if (!lead) {
    return NextResponse.json({ error: "Ikke fundet" }, { status: 404 });
  }
  void session;
  return NextResponse.json({
    id: lead.id,
    status: lead.status,
    lastOutcomeAt: lead.lastOutcomeAt ? lead.lastOutcomeAt.toISOString() : null,
    voicemailMarkedAt: lead.voicemailMarkedAt
      ? lead.voicemailMarkedAt.toISOString()
      : null,
    notHomeMarkedAt: lead.notHomeMarkedAt ? lead.notHomeMarkedAt.toISOString() : null,
  });
}

export const runtime = "nodejs";

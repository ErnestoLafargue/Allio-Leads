import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW, type ActiveCampaignQueueViewV1 } from "@/lib/active-campaign-queue";

type Params = { params: Promise<{ id: string }> };

function isActiveQueueViewBody(body: unknown): body is ActiveCampaignQueueViewV1 {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return o.version === 1;
}

/**
 * Gemmer «Filtrér på kampagnefelt» + sortering som server-side kø for hele kampagnen.
 * Alle indloggede brugere (med adgang til kampagne) kan gemme, så visningen er ens for holdet.
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id: campaignId } = await params;
  const body = await req.json().catch(() => null);
  if (!isActiveQueueViewBody(body)) {
    return NextResponse.json({ error: "Ugyldigt kampagneview (forventet version: 1)." }, { status: 400 });
  }

  const existing = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, systemCampaignType: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }
  if (existing.systemCampaignType === "active_customers" && session!.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Kun administratorer har adgang til «Aktive kunder»." },
      { status: 403 },
    );
  }

  const merged: ActiveCampaignQueueViewV1 = { ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW, ...body, version: 1 };

  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { activeQueueFilter: JSON.stringify(merged) },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke gemme kampagneview.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, activeQueueFilter: JSON.stringify(merged) });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { userCanAccessCampaign } from "@/lib/campaign-access";
import { bookingSystemFilterKey } from "@/lib/active-campaign-queue";

type Params = { params: Promise<{ id: string }> };

/**
 * Bookingsystemer på kampagnens leads (til valgliste uafhængigt af aktive køfilter).
 * "" = leads uden bookingsystem. Varianter i store/små bogstaver slås sammen.
 */
export async function GET(_req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { id: campaignId } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }
  if (!(await userCanAccessCampaign(session!.user, campaignId))) {
    return NextResponse.json(
      { error: "Du har ikke adgang til denne kampagne." },
      { status: 403 },
    );
  }

  const groups = await prisma.lead.groupBy({
    by: ["bookingSystem"],
    where: { campaignId },
    _count: { _all: true },
  });
  const byKey = new Map<string, { value: string; count: number }>();
  for (const g of groups) {
    const value = g.bookingSystem.trim();
    const key = bookingSystemFilterKey(value);
    const hit = byKey.get(key);
    if (hit) hit.count += g._count._all;
    else byKey.set(key, { value, count: g._count._all });
  }
  // Navngivne systemer alfabetisk, «intet bookingsystem» sidst.
  const bookingSystems = [...byKey.values()].sort((a, b) => {
    if (!a.value) return 1;
    if (!b.value) return -1;
    return a.value.localeCompare(b.value, "da", { sensitivity: "base" });
  });

  return NextResponse.json({ bookingSystems });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { userCanAccessCampaign } from "@/lib/campaign-access";

type Params = { params: Promise<{ id: string }> };

/**
 * Unikke branche-strenge for kampagnen (til valgliste uafhængigt af aktive køfilter).
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

  const rows = await prisma.lead.findMany({
    where: { campaignId },
    select: { industry: true },
  });
  const unique = Array.from(
    new Set(
      rows
        .map((r) => r.industry?.trim() ?? "")
        .filter((v) => v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "da", { sensitivity: "base" }));

  return NextResponse.json({ industries: unique });
}

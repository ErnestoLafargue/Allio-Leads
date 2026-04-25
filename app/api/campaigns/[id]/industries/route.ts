import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

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
    select: { id: true, systemCampaignType: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
  }
  if (campaign.systemCampaignType === "active_customers" && session!.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Kun administratorer har adgang til «Aktive kunder»." },
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

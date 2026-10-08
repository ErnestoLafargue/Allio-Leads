import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { userCanAccessCampaign } from "@/lib/campaign-access";
import { parseCustomFields } from "@/lib/custom-fields";
import { COMPANY_TYPE_CUSTOM_KEY } from "@/lib/active-campaign-queue";

type Params = { params: Promise<{ id: string }> };

/**
 * Unikke virksomhedstype-strenge for kampagnen (til valgliste uafhængigt af aktive køfilter).
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
    select: { customFields: true },
  });
  const unique = Array.from(
    new Set(
      rows
        .map((r) => {
          const custom = parseCustomFields(r.customFields);
          return (custom[COMPANY_TYPE_CUSTOM_KEY] ?? "").trim();
        })
        .filter((v) => v.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, "da", { sensitivity: "base" }));

  return NextResponse.json({ companyTypes: unique });
}

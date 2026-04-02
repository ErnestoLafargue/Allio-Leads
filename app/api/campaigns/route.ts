import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const campaigns = await prisma.campaign.findMany({
      where:
        session!.user.role === "ADMIN"
          ? {}
          : { NOT: { systemCampaignType: "active_customers" } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fieldConfig: true,
        includeProtectedBusinesses: true,
        isSystemCampaign: true,
        systemCampaignType: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { leads: true } },
      },
    });

    return NextResponse.json(campaigns);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("includeProtectedBusinesses") ||
      msg.includes("isSystemCampaign") ||
      msg.includes("systemCampaignType") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen mangler nye kolonner. Kør «npx prisma migrate deploy» i mappen «allio-leads» og genstart serveren."
          : "Kunne ikke hente kampagner.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Kampagnenavn er påkrævet" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      fieldConfig: defaultCampaignFieldConfigJson(),
      includeProtectedBusinesses: false,
    },
    select: {
      id: true,
      name: true,
      fieldConfig: true,
      includeProtectedBusinesses: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(campaign);
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";
import { listCampaignsWithStats } from "@/lib/campaign-list-query";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const enriched = await listCampaignsWithStats(session!.user);
    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const prismaCode =
      e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
    console.error("[api/campaigns] GET failed:", prismaCode ? `${prismaCode}: ${msg}` : msg);

    const migrationHint =
      msg.includes("includeProtectedBusinesses") ||
      msg.includes("includeLeadsWithoutPhone") ||
      msg.includes("isSystemCampaign") ||
      msg.includes("systemCampaignType") ||
      msg.includes("dialMode") ||
      msg.includes("activeQueueFilter") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");

    const transientByPrismaCode =
      prismaCode === "P1001" ||
      prismaCode === "P1002" ||
      prismaCode === "P1017";

    const transientDb =
      transientByPrismaCode ||
      /\bP1001\b/.test(msg) ||
      /\bP1002\b/.test(msg) ||
      /\bP1017\b/.test(msg) ||
      /timed?\s*out/i.test(msg) ||
      /timeout/i.test(msg) ||
      /ECONNRESET/i.test(msg) ||
      /Connection.*?closed/i.test(msg) ||
      /Server has closed the connection/i.test(msg);

    let error: string;
    let userHint: "migrate" | "retry_later" | null = null;
    if (migrationHint) {
      error =
        "Databasen mangler nye kolonner. Kør «npx prisma migrate deploy» i mappen «allio-leads» og genstart serveren.";
      userHint = "migrate";
    } else if (transientDb) {
      error =
        "Kunne ikke hente kampagner lige nu — databasen svarede ikke i tide. Prøv igen om et øjeblik.";
      userHint = "retry_later";
    } else {
      error = "Kunne ikke hente kampagner.";
    }

    return NextResponse.json(
      {
        error,
        userHint,
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

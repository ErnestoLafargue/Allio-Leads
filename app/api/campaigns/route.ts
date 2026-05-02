import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/api-auth";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";
import { sortCampaignsForDisplay } from "@/lib/campaign-list-sort";
import { workableCampaignLeadsWhere } from "@/lib/campaign-workable-leads";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";

/** Sælgere: alle kampagner undtagen «Aktive kunder». Almindelige kampagner har typisk systemCampaignType = null — `NOT (kolonne = …)` udelukker NULL i SQL, så vi skal eksplicit inkludere null. */
function campaignWhereForRole(role: string | undefined) {
  if (role === "ADMIN") return {};
  return {
    OR: [
      { systemCampaignType: null },
      { NOT: { systemCampaignType: "active_customers" } },
    ],
  };
}

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const rows = await prisma.campaign.findMany({
      where: campaignWhereForRole(session!.user.role),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        fieldConfig: true,
        includeProtectedBusinesses: true,
        isSystemCampaign: true,
        systemCampaignType: true,
        dialMode: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            leads: { where: workableCampaignLeadsWhere },
          },
        },
      },
    });

    const campaigns = sortCampaignsForDisplay(rows);

    /// Optælling af agenter online + mine genopkald pr. kampagne i parallel — best-effort.
    /// Hvis databasen mangler kolonnerne, falder vi tilbage til 0.
    const userId = session!.user.id;
    const presenceCutoff = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
    const ids = campaigns.map((c) => c.id);

    const [agentRows, callbackRows] = await Promise.all([
      ids.length === 0
        ? Promise.resolve<{ campaignId: string; _count: { _all: number } }[]>([])
        : prisma.agentSession
            .groupBy({
              by: ["campaignId"],
              where: {
                campaignId: { in: ids },
                status: { in: ["ready", "ringing", "talking", "wrap_up"] },
                lastHeartbeat: { gte: presenceCutoff },
              },
              _count: { _all: true },
            })
            .catch(() => []),
      ids.length === 0
        ? Promise.resolve<{ campaignId: string | null; _count: { _all: number } }[]>([])
        : prisma.lead
            .groupBy({
              by: ["campaignId"],
              where: {
                campaignId: { in: ids },
                callbackReservedByUserId: userId,
                callbackStatus: "PENDING",
              },
              _count: { _all: true },
            })
            .catch(() => []),
    ]);

    const agentsByCampaign = new Map<string, number>();
    for (const r of agentRows) {
      agentsByCampaign.set(r.campaignId, r._count._all);
    }
    const callbacksByCampaign = new Map<string, number>();
    for (const r of callbackRows) {
      if (typeof r.campaignId === "string") {
        callbacksByCampaign.set(r.campaignId, r._count._all);
      }
    }

    const enriched = campaigns.map((c) => ({
      ...c,
      agentsOnline: agentsByCampaign.get(c.id) ?? 0,
      myCallbacks: callbacksByCampaign.get(c.id) ?? 0,
    }));

    return NextResponse.json(enriched);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const prismaCode =
      e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
    console.error("[api/campaigns] GET failed:", prismaCode ? `${prismaCode}: ${msg}` : msg);

    const migrationHint =
      msg.includes("includeProtectedBusinesses") ||
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

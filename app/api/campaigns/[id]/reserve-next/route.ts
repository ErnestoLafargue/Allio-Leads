import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { filterLeadsByCampaignProtectedSetting } from "@/lib/reklamebeskyttet-filter";
import { sortLeadsForCampaignCallQueue } from "@/lib/lead-queue";
import { releaseExpiredLocksEverywhere, tryAcquireLeadLock } from "@/lib/lead-lock";

type Params = { params: Promise<{ id: string }> };

const leadInclude = {
  bookedByUser: { select: { id: true, name: true, username: true } as const },
  campaign: { select: { id: true, name: true, fieldConfig: true } as const },
  lockedByUser: { select: { id: true, name: true, username: true } as const },
} as const;

/**
 * Atomisk reservation af næste «Ny»-lead i kampagnen til opkald/arbejdsflow.
 * Post body (valgfri): { "preferLeadId": "…" } for at genåbne samme lead efter refresh, hvis det stadig er ledigt.
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignId = (await params).id;

  const body = await req.json().catch(() => null);
  const preferLeadId = typeof body?.preferLeadId === "string" ? body.preferLeadId.trim() : "";

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, includeProtectedBusinesses: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Kampagne findes ikke" }, { status: 404 });
    }

    const rawNew = await prisma.lead.findMany({
      where: { campaignId, status: "NEW" },
      select: {
        id: true,
        status: true,
        importedAt: true,
        customFields: true,
      },
    });

    const filtered = filterLeadsByCampaignProtectedSetting(
      rawNew.map((r) => ({ ...r, customFields: r.customFields })),
      campaign.includeProtectedBusinesses,
    );
    const sorted = sortLeadsForCampaignCallQueue(
      filtered.map((r) => ({
        id: r.id,
        status: r.status,
        importedAt:
          r.importedAt instanceof Date ? r.importedAt.toISOString() : String(r.importedAt),
      })),
    );

    async function tryReserve(id: string) {
      const ok = await tryAcquireLeadLock(prisma, id, userId);
      if (!ok) return null;
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: leadInclude,
      });
      return lead;
    }

    if (preferLeadId) {
      const allowed = new Set(sorted.map((r) => r.id));
      if (allowed.has(preferLeadId)) {
        const got = await tryReserve(preferLeadId);
        if (got) return NextResponse.json({ lead: got });
      }
    }

    for (const row of sorted) {
      const got = await tryReserve(row.id);
      if (got) return NextResponse.json({ lead: got });
    }

    return NextResponse.json({ lead: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen mangler lead-lås-kolonner. Kør «npx prisma migrate deploy» og genstart serveren."
          : "Kunne ikke reservere lead.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

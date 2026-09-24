import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { applyLeadCooldownResets } from "@/lib/lead-cooldown";
import { releaseExpiredLocksEverywhere } from "@/lib/lead-lock";
import { parseWorkspaceStartDateFilterFromRequestBody } from "@/lib/workspace-start-date-filter";
import { userCanAccessCampaign } from "@/lib/campaign-access";
import {
  campaignReserveSelect,
  reserveNextNewLeadFromCampaign,
  reserveNextPendingCallback,
} from "@/lib/campaign-queue-reserve";

type Params = { params: Promise<{ id: string }> };

/**
 * Atomisk reservation: først alle aktive planlagte callbacks for denne bruger (på tværs af kampagner), derefter «Ny»-køen.
 * Post body (valgfri): { "preferLeadId": "…" } for at genåbne samme Ny-lead efter refresh (gælder ikke for callback-prioritet).
 * { "excludeLeadId": "…" } springer dette lead over i både tilbagekald-prioritet og Ny-køen (fx efter planlagt callback).
 */
export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const userId = session!.user.id;
  const campaignId = (await params).id;

  const body = await req.json().catch(() => null);
  const preferLeadId = typeof body?.preferLeadId === "string" ? body.preferLeadId.trim() : "";
  const excludeLeadId = typeof body?.excludeLeadId === "string" ? body.excludeLeadId.trim() : "";
  const rawExcludeLeadIds: unknown[] = Array.isArray(body?.excludeLeadIds) ? body.excludeLeadIds : [];
  const excludeLeadIds = rawExcludeLeadIds
    .filter((v: unknown): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
  const excludedLeadSet = new Set<string>([excludeLeadId, ...excludeLeadIds].filter(Boolean));
  const workspaceStartFilter = parseWorkspaceStartDateFilterFromRequestBody(body);
  if (
    workspaceStartFilter?.enabled &&
    workspaceStartFilter.from &&
    workspaceStartFilter.to &&
    workspaceStartFilter.from > workspaceStartFilter.to
  ) {
    return NextResponse.json(
      { error: "«Fra» skal være før eller samme dag som «til» (startdato-filter)." },
      { status: 400 },
    );
  }

  try {
    await applyLeadCooldownResets();
    await releaseExpiredLocksEverywhere(prisma);

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: campaignReserveSelect,
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

    const now = new Date();

    const callbackLead = await reserveNextPendingCallback({
      userId,
      now,
      excludedLeadIds: excludedLeadSet,
      allowedCampaignIds: null,
    });
    if (callbackLead) {
      return NextResponse.json({ lead: callbackLead });
    }

    const newLead = await reserveNextNewLeadFromCampaign({
      userId,
      now,
      campaign,
      preferLeadId: preferLeadId || undefined,
      excludedLeadIds: excludedLeadSet,
      workspaceStartFilter,
    });

    return NextResponse.json({ lead: newLead });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const migrationHint =
      msg.includes("lockedByUserId") ||
      msg.includes("lockExpiresAt") ||
      msg.includes("callbackScheduledFor") ||
      msg.includes("callbackReservedByUserId") ||
      msg.includes("callbackSeenByAssigneeAt") ||
      msg.includes("lastOutcomeAt") ||
      msg.includes("no such column") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: migrationHint
          ? "Databasen matcher ikke den aktuelle kode (manglende kolonner). Kør «npm run db:migrate» i projektmappen (indlæser .env.local), eller «npx prisma migrate deploy» med DATABASE_URL sat — genstart derefter dev-serveren."
          : "Kunne ikke reservere lead.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

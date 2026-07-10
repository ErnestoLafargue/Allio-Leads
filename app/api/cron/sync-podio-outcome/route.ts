import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizePodioCron } from "@/lib/podio/cron-auth";
import { applyMoederItemUpdate } from "@/lib/podio/moeder-item-update";
import { isPodioAppConfigured } from "@/lib/podio/client";

/**
 * Hent aktuel Podio-status for et lead og anvend mødeudfald i Allio.
 * GET /api/cron/sync-podio-outcome?leadId=...
 */
export async function GET(req: Request) {
  if (!authorizePodioCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = (new URL(req.url).searchParams.get("leadId") ?? "").trim();
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  if (!isPodioAppConfigured("moeder")) {
    return NextResponse.json({ error: "Podio Møder-app ikke konfigureret" }, { status: 500 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, podioItemId: true, meetingOutcomeStatus: true },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const itemId = Number(lead.podioItemId ?? "");
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Lead has no podioItemId" }, { status: 400 });
  }

  try {
    const result = await applyMoederItemUpdate(itemId);
    const after = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { meetingOutcomeStatus: true },
    });

    return NextResponse.json({
      ok: true,
      leadId,
      itemId,
      before: { meetingOutcomeStatus: lead.meetingOutcomeStatus },
      after: { meetingOutcomeStatus: after?.meetingOutcomeStatus ?? null },
      sync: result,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

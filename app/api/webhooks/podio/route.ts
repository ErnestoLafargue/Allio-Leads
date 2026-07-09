import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getItem,
  isPodioAppConfigured,
  readCategoryValue,
  validateHook,
} from "@/lib/podio/client";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";
import {
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  MOEDE_FIELDS,
  normalizeMoedeStatus,
  resolveLeadIdFromMoedeItem,
} from "@/lib/podio/meeting-sync";

/**
 * Indgående Podio-webhook (Podio → Allio) for Møder-appen i Salg-workspace.
 *
 * Status ændres i Podio → opdater mødeudfald i Allio:
 *   - Møde aflyst - Genbook → Genbook-kampagne
 *   - Møde Tabt → udfald Tabt
 *   - Møde vundet → udfald Salg
 */

function expectedToken(): string {
  return (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
}

function tokenOk(req: Request): boolean {
  const expected = expectedToken();
  if (!expected) return true;
  const got = (new URL(req.url).searchParams.get("token") ?? "").trim();
  return got === expected;
}

async function applyLostOutcome(leadId: string): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: { meetingOutcomeStatus: MEETING_OUTCOME_LOST },
  });
  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: "Møde sat til Tabt i Podio.",
    },
  });
}

async function applySaleOutcome(leadId: string): Promise<void> {
  const { ensureSystemCampaignId } = await import("@/lib/ensure-system-campaigns");
  const activeCustomersId = await ensureSystemCampaignId("active_customers");

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      meetingOutcomeStatus: MEETING_OUTCOME_SALE,
      campaignId: activeCustomersId,
    },
  });
  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: "Møde sat til Vundet i Podio — flyttet til Aktive kunder.",
    },
  });
}

async function handleMoederItemUpdate(itemId: number): Promise<NextResponse> {
  const item = await getItem("moeder", itemId);
  if (!item) {
    return NextResponse.json({ ok: true, ignored: "item not found" });
  }

  const leadId = resolveLeadIdFromMoedeItem(item);
  const statusRaw = readCategoryValue(item, MOEDE_FIELDS.status);
  const statusKey = normalizeMoedeStatus(statusRaw);

  console.log(
    `[podio] item.update møde item=${item.item_id} ext=${item.external_id ?? "?"} status=${statusRaw ?? "?"} lead=${leadId ?? "?"}`,
  );

  if (!leadId) {
    return NextResponse.json({ ok: true, ignored: "no lead" });
  }

  if (statusKey === "genbook") {
    const moved = await moveLeadToRebooking(leadId);
    return NextResponse.json({
      ok: true,
      handled: "item.update",
      action: moved ? "genbook" : "noop",
    });
  }

  if (statusKey === "tabt") {
    await applyLostOutcome(leadId);
    return NextResponse.json({ ok: true, handled: "item.update", action: "tabt" });
  }

  if (statusKey === "vundet") {
    await applySaleOutcome(leadId);
    return NextResponse.json({ ok: true, handled: "item.update", action: "vundet" });
  }

  return NextResponse.json({ ok: true, handled: "item.update", action: "none", status: statusRaw });
}

export async function POST(req: Request) {
  let params: URLSearchParams;
  try {
    const raw = await req.text();
    params = new URLSearchParams(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const type = (params.get("type") ?? "").trim();
  const hookId = (params.get("hook_id") ?? "").trim();

  if (type !== "hook.verify" && !tokenOk(req)) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  if (type === "hook.verify") {
    const code = (params.get("code") ?? "").trim();
    if (hookId && code && isPodioAppConfigured("moeder")) {
      try {
        await validateHook("moeder", hookId, code);
      } catch {
        console.error("[podio] hook.verify validering fejlede");
        return NextResponse.json({ ok: false, error: "verify failed" }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, handled: "hook.verify" });
  }

  if (type === "item.create" || type === "item.update") {
    const itemId = Number((params.get("item_id") ?? "").trim());
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ ok: true, ignored: "no item_id" });
    }

    if (!isPodioAppConfigured("moeder")) {
      return NextResponse.json({ ok: true, ignored: "podio not configured" });
    }

    try {
      return await handleMoederItemUpdate(itemId);
    } catch (err) {
      console.error("[podio] webhook-behandling fejlede:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: true, error: "processing failed" });
    }
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "podio-webhook" });
}

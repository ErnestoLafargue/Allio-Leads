import { prisma } from "@/lib/prisma";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { getItem, readCategoryValue } from "@/lib/podio/client";
import {
  MOEDE_FIELDS,
  normalizeMoedeStatus,
  resolveLeadIdFromMoedeItem,
} from "@/lib/podio/meeting-sync";

export type MoederItemUpdateResult = {
  ok: true;
  ignored?: string;
  handled?: string;
  action?: string;
  status?: string | null;
  leadId?: string;
  itemId?: number;
};

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

/** Anvend Podio Møder-item status på tilknyttet Allio-lead. */
export async function applyMoederItemUpdate(itemId: number): Promise<MoederItemUpdateResult> {
  const item = await getItem("moeder", itemId);
  if (!item) {
    return { ok: true, ignored: "item not found", itemId };
  }

  const leadId = resolveLeadIdFromMoedeItem(item);
  const statusRaw = readCategoryValue(item, MOEDE_FIELDS.status);
  const statusKey = normalizeMoedeStatus(statusRaw);

  console.log(
    `[podio] item.update møde item=${item.item_id} ext=${item.external_id ?? "?"} status=${statusRaw ?? "?"} lead=${leadId ?? "?"}`,
  );

  if (!leadId) {
    return { ok: true, ignored: "no lead", itemId, status: statusRaw };
  }

  if (statusKey === "genbook") {
    const moved = await moveLeadToRebooking(leadId);
    return {
      ok: true,
      handled: "item.update",
      action: moved ? "genbook" : "noop",
      leadId,
      itemId,
      status: statusRaw,
    };
  }

  if (statusKey === "tabt") {
    await applyLostOutcome(leadId);
    return { ok: true, handled: "item.update", action: "tabt", leadId, itemId, status: statusRaw };
  }

  if (statusKey === "vundet") {
    await applySaleOutcome(leadId);
    return { ok: true, handled: "item.update", action: "vundet", leadId, itemId, status: statusRaw };
  }

  return {
    ok: true,
    handled: "item.update",
    action: "none",
    leadId,
    itemId,
    status: statusRaw,
  };
}

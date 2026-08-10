import { prisma } from "@/lib/prisma";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  MEETING_OUTCOME_IN_PROGRESS,
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
  normalizeMeetingOutcomeStatus,
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

async function currentOutcome(leadId: string): Promise<string | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { meetingOutcomeStatus: true },
  });
  if (!lead) return null;
  return normalizeMeetingOutcomeStatus(lead.meetingOutcomeStatus);
}

async function applyPendingOutcome(leadId: string): Promise<boolean> {
  if ((await currentOutcome(leadId)) === MEETING_OUTCOME_PENDING) return false;
  await prisma.lead.update({
    where: { id: leadId },
    data: { meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
  });
  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: "Møde sat til Afventer afholdelse i Podio.",
    },
  });
  return true;
}

async function applyInProgressOutcome(leadId: string): Promise<boolean> {
  if ((await currentOutcome(leadId)) === MEETING_OUTCOME_IN_PROGRESS) return false;
  await prisma.lead.update({
    where: { id: leadId },
    data: { meetingOutcomeStatus: MEETING_OUTCOME_IN_PROGRESS },
  });
  await prisma.leadActivityEvent.create({
    data: {
      leadId,
      userId: null,
      kind: LEAD_ACTIVITY_KIND.MEETING_OUTCOME_SET,
      summary: "Møde sat til Under Behandling i Podio.",
    },
  });
  return true;
}

async function applyLostOutcome(leadId: string): Promise<boolean> {
  if ((await currentOutcome(leadId)) === MEETING_OUTCOME_LOST) return false;
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
  return true;
}

async function applySaleOutcome(leadId: string): Promise<boolean> {
  if ((await currentOutcome(leadId)) === MEETING_OUTCOME_SALE) return false;
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
  return true;
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
    const changed = await applyLostOutcome(leadId);
    return {
      ok: true,
      handled: "item.update",
      action: changed ? "tabt" : "noop",
      leadId,
      itemId,
      status: statusRaw,
    };
  }

  if (statusKey === "vundet") {
    const changed = await applySaleOutcome(leadId);
    return {
      ok: true,
      handled: "item.update",
      action: changed ? "vundet" : "noop",
      leadId,
      itemId,
      status: statusRaw,
    };
  }

  if (statusKey === "underBehandling") {
    const changed = await applyInProgressOutcome(leadId);
    return {
      ok: true,
      handled: "item.update",
      action: changed ? "underBehandling" : "noop",
      leadId,
      itemId,
      status: statusRaw,
    };
  }

  if (statusKey === "afventer") {
    const changed = await applyPendingOutcome(leadId);
    return {
      ok: true,
      handled: "item.update",
      action: changed ? "afventer" : "noop",
      leadId,
      itemId,
      status: statusRaw,
    };
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

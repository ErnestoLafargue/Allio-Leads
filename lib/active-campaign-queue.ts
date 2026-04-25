import type { PrismaClient } from "@prisma/client";
import { parseFieldConfig, FIELD_GROUPS, findStartDateExtensionField } from "@/lib/campaign-fields";
import { parseCustomFields } from "@/lib/custom-fields";
import { localDayKeyFromMs, parseDateStringLoose, timestampForSort } from "@/lib/parse-date-string";
import { leadMatchesWorkspaceStartDateFilter } from "@/lib/workspace-start-date-filter";
import type { WorkspaceStartDateFilterState } from "@/lib/workspace-start-date-filter";

const VIEW_VERSION = 1 as const;

/**
 * Det der gemmes på `Campaign.activeQueueFilter` når man trykker «Gem filter/sortering».
 * Matcher semantik i `leads-bulk-panel` (sortedLeads uden tabel-klik-sortering).
 */
export type ActiveCampaignQueueViewV1 = {
  version: typeof VIEW_VERSION;
  filterMeetingStart: boolean;
  campaignFilterMode: "startdate" | "industry";
  meetingStartFrom: string;
  meetingStartTo: string;
  selectedCampaignIndustries: string[];
  dynamicSortFieldId: string;
  dynamicSortDir: "asc" | "desc";
  dynamicFromDate: string;
  dynamicToDate: string;
  dynamicDateInvert: boolean;
};

export const EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW: ActiveCampaignQueueViewV1 = {
  version: VIEW_VERSION,
  filterMeetingStart: false,
  campaignFilterMode: "startdate",
  meetingStartFrom: "",
  meetingStartTo: "",
  selectedCampaignIndustries: [],
  dynamicSortFieldId: "",
  dynamicSortDir: "asc",
  dynamicFromDate: "",
  dynamicToDate: "",
  dynamicDateInvert: false,
};

export function parseActiveCampaignQueueView(
  raw: string | null | undefined,
): ActiveCampaignQueueViewV1 {
  if (!raw || !String(raw).trim()) return { ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW };
  try {
    const j = JSON.parse(String(raw)) as unknown;
    if (!j || typeof j !== "object") return { ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW };
    const o = j as Record<string, unknown>;
    if (o.version !== VIEW_VERSION) return { ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW };
    return {
      version: VIEW_VERSION,
      filterMeetingStart: o.filterMeetingStart === true,
      campaignFilterMode: o.campaignFilterMode === "industry" ? "industry" : "startdate",
      meetingStartFrom: typeof o.meetingStartFrom === "string" ? o.meetingStartFrom : "",
      meetingStartTo: typeof o.meetingStartTo === "string" ? o.meetingStartTo : "",
      selectedCampaignIndustries: Array.isArray(o.selectedCampaignIndustries)
        ? o.selectedCampaignIndustries.filter((v): v is string => typeof v === "string")
        : [],
      dynamicSortFieldId: typeof o.dynamicSortFieldId === "string" ? o.dynamicSortFieldId : "",
      dynamicSortDir: o.dynamicSortDir === "desc" ? "desc" : "asc",
      dynamicFromDate: typeof o.dynamicFromDate === "string" ? o.dynamicFromDate : "",
      dynamicToDate: typeof o.dynamicToDate === "string" ? o.dynamicToDate : "",
      dynamicDateInvert: o.dynamicDateInvert === true,
    };
  } catch {
    return { ...EMPTY_ACTIVE_CAMPAIGN_QUEUE_VIEW };
  }
}

/**
 * Så længe intet reelt filter er valgt, skal hele kampagne/GET opføre sig uændret.
 */
export function hasActiveQueueViewConstraints(v: ActiveCampaignQueueViewV1 | null | undefined): boolean {
  if (!v) return false;
  if (v.filterMeetingStart) {
    if (v.campaignFilterMode === "industry") return true; // også tom liste = 0 træf
    if (v.campaignFilterMode === "startdate" && (v.meetingStartFrom.trim() || v.meetingStartTo.trim())) {
      return true;
    }
  }
  if (v.dynamicSortFieldId.trim() && (v.dynamicFromDate.trim() || v.dynamicToDate.trim())) {
    return true;
  }
  return false;
}

function getDynamicValue(
  l: { customFields: string; industry?: string; [key: string]: unknown },
  fieldId: string,
): string {
  if (fieldId.startsWith("custom:")) {
    const key = fieldId.slice("custom:".length);
    return parseCustomFields(l.customFields ?? "")[key] ?? "";
  }
  const v = (l as Record<string, unknown>)[fieldId];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function getDynamicFieldKindForView(fieldId: string): "text" | "number" | "date" {
  if (!fieldId) return "text";
  if (["importedAt", "lastOutcomeAt", "meetingScheduledFor"].includes(fieldId)) return "date";
  if (["postalCode", "phone", "cvr"].includes(fieldId)) return "number";
  if (fieldId.startsWith("custom:")) {
    return "text";
  }
  return "text";
}

function getDynamicFieldKindFromConfig(fieldId: string, fieldConfigJson: string): "text" | "number" | "date" {
  if (["importedAt", "lastOutcomeAt", "meetingScheduledFor"].includes(fieldId)) return "date";
  if (["postalCode", "phone", "cvr"].includes(fieldId)) return "number";
  if (fieldId.startsWith("custom:")) {
    const key = fieldId.slice("custom:".length);
    const cfg = parseFieldConfig(fieldConfigJson);
    for (const g of FIELD_GROUPS) {
      for (const f of cfg.extensions[g] ?? []) {
        if (f.key === key) {
          const raw = `${f.label} ${f.key}`.toLowerCase();
          if (raw.includes("dato") || raw.includes("date")) return "date";
          if (
            raw.includes("telefon") ||
            raw.includes("tlf") ||
            raw.includes("cvr") ||
            raw.includes("nummer")
          ) {
            return "number";
          }
          return "text";
        }
      }
    }
  }
  return getDynamicFieldKindForView(fieldId);
}

type LeadRowInput = {
  id: string;
  industry: string;
  customFields: string;
  meetingScheduledFor: Date | string | null;
};

/**
 * Samme udvælgelse som i `leads-bulk-panel` (filtreringsdel), brugt server-side.
 */
export function leadMatchesActiveCampaignQueueView(
  lead: LeadRowInput,
  fieldConfigJson: string,
  view: ActiveCampaignQueueViewV1,
): boolean {
  if (view.filterMeetingStart && view.campaignFilterMode === "startdate") {
    const startField = findStartDateExtensionField(parseFieldConfig(fieldConfigJson));
    if (startField && (view.meetingStartFrom.trim() || view.meetingStartTo.trim())) {
      const raw = parseCustomFields(lead.customFields ?? "")[startField.key] ?? "";
      const ms = parseDateStringLoose(raw);
      if (ms == null) return false;
      const key = localDayKeyFromMs(ms);
      if (view.meetingStartFrom && key < view.meetingStartFrom) return false;
      if (view.meetingStartTo && key > view.meetingStartTo) return false;
    } else if (!startField) {
      const f: WorkspaceStartDateFilterState = {
        enabled: true,
        from: view.meetingStartFrom,
        to: view.meetingStartTo,
      };
      if (!leadMatchesWorkspaceStartDateFilter(lead, fieldConfigJson, f)) return false;
    }
  }

  if (view.filterMeetingStart && view.campaignFilterMode === "industry") {
    if (view.selectedCampaignIndustries.length === 0) return false;
    const selected = new Set(
      view.selectedCampaignIndustries.map((v) => v.trim().toLocaleLowerCase("da")),
    );
    const normalized = (lead.industry ?? "").trim().toLocaleLowerCase("da");
    if (normalized.length === 0) return false;
    if (!selected.has(normalized)) return false;
  }

  if (view.dynamicSortFieldId.trim() && (view.dynamicFromDate.trim() || view.dynamicToDate.trim())) {
    const fieldId = view.dynamicSortFieldId;
    const kind = getDynamicFieldKindFromConfig(fieldId, fieldConfigJson);
    if (kind === "date") {
      const raw = getDynamicValue(lead, fieldId);
      const t = timestampForSort(raw);
      if (!Number.isFinite(t)) return view.dynamicDateInvert;
      let inRange = true;
      if (view.dynamicFromDate) {
        const from = new Date(`${view.dynamicFromDate}T00:00:00`).getTime();
        if (Number.isFinite(from) && t < from) inRange = false;
      }
      if (view.dynamicToDate) {
        const to = new Date(`${view.dynamicToDate}T23:59:59.999`).getTime();
        if (Number.isFinite(to) && t > to) inRange = false;
      }
      if (view.dynamicDateInvert ? !inRange : inRange) return true;
      return false;
    }
  }

  return true;
}

export function filterLeadsByActiveCampaignQueueView<T extends LeadRowInput>(
  rows: T[],
  fieldConfigJson: string,
  rawView: string | null | undefined,
): T[] {
  const view = parseActiveCampaignQueueView(rawView);
  if (!hasActiveQueueViewConstraints(view)) return rows;
  return rows.filter((r) => leadMatchesActiveCampaignQueueView(r, fieldConfigJson, view));
}

/**
 * Fælles indsnævring efter andre kampagnefiltre. Er det samme som `filterLeadsByActiveCampaignQueueView` —
 * hent udstødte rækker ét sted, kør kø-/status-logik, og til sidst: `getActiveCampaignLeads(..., rækker, fieldConfig, campaign.activeQueueFilter)`.
 */
export const getActiveCampaignLeads = filterLeadsByActiveCampaignQueueView;

/** Central guard: kampagne-gemt filter aktivt, og leadet matcher ikke. */
export async function assertLeadMatchesActiveCampaignQueueOr403(
  prisma: PrismaClient,
  leadId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      campaignId: true,
      industry: true,
      customFields: true,
      meetingScheduledFor: true,
      campaign: { select: { activeQueueFilter: true, fieldConfig: true } },
    },
  });
  if (!lead?.campaignId || !lead.campaign) {
    return { ok: true };
  }
  const raw = lead.campaign.activeQueueFilter;
  const view = parseActiveCampaignQueueView(raw);
  if (!hasActiveQueueViewConstraints(view)) {
    return { ok: true };
  }
  const ok = leadMatchesActiveCampaignQueueView(
    {
      id: lead.id,
      industry: lead.industry ?? "",
      customFields: lead.customFields ?? "",
      meetingScheduledFor: lead.meetingScheduledFor,
    },
    lead.campaign.fieldConfig ?? "{}",
    view,
  );
  if (ok) return { ok: true };
  return { ok: false, error: "Leadet matcher ikke det aktive kampagnefilter." };
}

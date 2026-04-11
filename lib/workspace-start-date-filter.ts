import { parseFieldConfig, findStartDateExtensionField } from "@/lib/campaign-fields";
import { parseCustomFields } from "@/lib/custom-fields";
import { copenhagenDayKey } from "@/lib/copenhagen-day";
import { localDayKeyFromMs, parseDateStringLoose } from "@/lib/parse-date-string";

/** Synkroniseret med kampagne-layout: «Filtrér på startdato». */
export type WorkspaceStartDateFilterState = {
  enabled: boolean;
  /** `YYYY-MM-DD` fra `<input type="date">` */
  from: string;
  to: string;
};

export function workspaceStartDateFilterStorageKey(campaignId: string): string {
  return `kampagne-layout-startdato:${campaignId}`;
}

/** Én læsning til `useState`-startværdi (kampagne-layout). */
export function initialWorkspaceStartFilterFromStorage(
  campaignId: string | null,
): WorkspaceStartDateFilterState {
  if (!campaignId) return { enabled: false, from: "", to: "" };
  return readWorkspaceStartDateFilter(campaignId) ?? { enabled: false, from: "", to: "" };
}

export function readWorkspaceStartDateFilter(
  campaignId: string,
): WorkspaceStartDateFilterState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(workspaceStartDateFilterStorageKey(campaignId));
    if (!raw) return null;
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    return {
      enabled: o.enabled === true,
      from: typeof o.from === "string" ? o.from : "",
      to: typeof o.to === "string" ? o.to : "",
    };
  } catch {
    return null;
  }
}

export function writeWorkspaceStartDateFilter(
  campaignId: string,
  state: WorkspaceStartDateFilterState,
): void {
  try {
    localStorage.setItem(workspaceStartDateFilterStorageKey(campaignId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearWorkspaceStartDateFilter(campaignId: string): void {
  try {
    localStorage.removeItem(workspaceStartDateFilterStorageKey(campaignId));
  } catch {
    /* ignore */
  }
}

/** Body til `POST /api/campaigns/:id/reserve-next` (klient). */
export function buildReserveNextRequestBody(
  campaignId: string,
  extra: { preferLeadId?: string; excludeLeadId?: string },
): string {
  const f = readWorkspaceStartDateFilter(campaignId);
  const payload: Record<string, unknown> = { ...extra };
  if (f?.enabled) {
    payload.workspaceStartDateFilter = { enabled: true, from: f.from, to: f.to };
  }
  return JSON.stringify(payload);
}

export function parseWorkspaceStartDateFilterFromRequestBody(body: unknown): WorkspaceStartDateFilterState | null {
  if (!body || typeof body !== "object") return null;
  const w = (body as Record<string, unknown>).workspaceStartDateFilter;
  if (w == null || typeof w !== "object") return null;
  const o = w as Record<string, unknown>;
  if (o.enabled !== true) return null;
  return {
    enabled: true,
    from: typeof o.from === "string" ? o.from.trim() : "",
    to: typeof o.to === "string" ? o.to.trim() : "",
  };
}

type Row = {
  customFields: string;
  meetingScheduledFor: Date | string | null;
};

/**
 * Samme semantik som i `LeadsBulkPanel` (custom «Start dato» vs. planlagt møde).
 */
export function leadMatchesWorkspaceStartDateFilter(
  lead: Row,
  fieldConfigJson: string,
  filter: WorkspaceStartDateFilterState | null,
): boolean {
  if (!filter?.enabled) return true;
  const from = filter.from.trim();
  const to = filter.to.trim();
  if (!from && !to) return true;

  const cfg = parseFieldConfig(fieldConfigJson);
  const startField = findStartDateExtensionField(cfg);

  if (startField) {
    const raw = parseCustomFields(lead.customFields ?? "")[startField.key] ?? "";
    const ms = parseDateStringLoose(raw);
    if (ms == null) return false;
    const key = localDayKeyFromMs(ms);
    if (from && key < from) return false;
    if (to && key > to) return false;
    return true;
  }

  const msf = lead.meetingScheduledFor;
  if (msf == null) return false;
  const d = msf instanceof Date ? msf : new Date(msf);
  const key = copenhagenDayKey(d);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export function filterLeadsByWorkspaceStartDate<T extends Row>(
  rows: T[],
  fieldConfigJson: string,
  filter: WorkspaceStartDateFilterState | null,
): T[] {
  if (!filter?.enabled) return rows;
  return rows.filter((r) => leadMatchesWorkspaceStartDateFilter(r, fieldConfigJson, filter));
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { LeadOutcomeModal } from "@/app/components/lead-outcome-modal";
import { isLockActive } from "@/lib/lead-lock";
import { parseCustomFields } from "@/lib/custom-fields";
import {
  parseFieldConfig,
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  findStartDateExtensionField,
} from "@/lib/campaign-fields";
import { localDayKeyFromMs, parseDateStringLoose, timestampForSort } from "@/lib/parse-date-string";
import {
  clearWorkspaceStartDateFilter,
  initialWorkspaceStartFilterFromStorage,
  readWorkspaceStartDateFilter,
  writeWorkspaceStartDateFilter,
} from "@/lib/workspace-start-date-filter";

type CampaignLeadViewPrefs = {
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

function campaignLeadViewPrefsStorageKey(campaignId: string): string {
  return `kampagne-layout-filter-sortering:${campaignId}`;
}

function readCampaignLeadViewPrefs(campaignId: string): CampaignLeadViewPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(campaignLeadViewPrefsStorageKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CampaignLeadViewPrefs>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      filterMeetingStart: parsed.filterMeetingStart === true,
      campaignFilterMode: parsed.campaignFilterMode === "industry" ? "industry" : "startdate",
      meetingStartFrom: typeof parsed.meetingStartFrom === "string" ? parsed.meetingStartFrom : "",
      meetingStartTo: typeof parsed.meetingStartTo === "string" ? parsed.meetingStartTo : "",
      selectedCampaignIndustries: Array.isArray(parsed.selectedCampaignIndustries)
        ? parsed.selectedCampaignIndustries.filter((v): v is string => typeof v === "string")
        : [],
      dynamicSortFieldId: typeof parsed.dynamicSortFieldId === "string" ? parsed.dynamicSortFieldId : "",
      dynamicSortDir: parsed.dynamicSortDir === "desc" ? "desc" : "asc",
      dynamicFromDate: typeof parsed.dynamicFromDate === "string" ? parsed.dynamicFromDate : "",
      dynamicToDate: typeof parsed.dynamicToDate === "string" ? parsed.dynamicToDate : "",
      dynamicDateInvert: parsed.dynamicDateInvert === true,
    };
  } catch {
    return null;
  }
}

function writeCampaignLeadViewPrefs(campaignId: string, prefs: CampaignLeadViewPrefs): void {
  try {
    localStorage.setItem(campaignLeadViewPrefsStorageKey(campaignId), JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function clearCampaignLeadViewPrefs(campaignId: string): void {
  try {
    localStorage.removeItem(campaignLeadViewPrefsStorageKey(campaignId));
  } catch {
    /* ignore */
  }
}

type LeadRow = {
  id: string;
  companyName: string;
  phone: string;
  email?: string;
  cvr?: string;
  address: string;
  postalCode: string;
  city: string;
  industry?: string;
  notes?: string;
  status: string;
  importedAt: string;
  lastOutcomeAt?: string | null;
  /** Fra API (til udfalds-modal) */
  meetingScheduledFor?: string | null;
  customFields?: string;
  campaign?: { id: string; name: string; fieldConfig?: string };
  lockedByUserId?: string | null;
  lockedAt?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { id: string; name: string; username: string } | null;
};

type DynamicFieldKind = "text" | "number" | "date";
type DynamicSortField = { id: string; label: string; kind: DynamicFieldKind };

function lockActive(l: Pick<LeadRow, "lockedByUserId" | "lockedAt" | "lockExpiresAt">): boolean {
  return isLockActive({
    lockedByUserId: l.lockedByUserId ?? null,
    lockedAt: l.lockedAt ? new Date(l.lockedAt) : null,
    lockExpiresAt: l.lockExpiresAt ? new Date(l.lockExpiresAt) : null,
  });
}

function isLockedByAnotherUser(l: LeadRow, myUserId: string | undefined): boolean {
  if (!lockActive(l) || !l.lockedByUserId) return false;
  if (myUserId && l.lockedByUserId === myUserId) return false;
  return true;
}

function isLockedByMe(l: LeadRow, myUserId: string | undefined): boolean {
  if (!myUserId || !lockActive(l) || l.lockedByUserId !== myUserId) return false;
  return true;
}

function meetingToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function formatAddressLine(l: Pick<LeadRow, "address" | "postalCode" | "city">) {
  const parts = [
    l.address?.trim(),
    [l.postalCode?.trim(), l.city?.trim()].filter(Boolean).join(" ").trim(),
  ].filter(Boolean);
  return parts.join(", ");
}

function formatDateCell(isoLike: string): string {
  const t = new Date(isoLike).getTime();
  if (!Number.isFinite(t)) return isoLike;
  return new Date(t).toLocaleDateString("da-DK");
}

type SortColumn = "company" | "phone" | "address" | "status" | "campaign" | "imported";

function compareLeads(a: LeadRow, b: LeadRow, key: SortColumn, dir: "asc" | "desc"): number {
  let cmp = 0;
  switch (key) {
    case "company":
      cmp = (a.companyName ?? "").localeCompare(b.companyName ?? "", "da", { sensitivity: "base" });
      break;
    case "address":
      cmp = formatAddressLine(a).localeCompare(formatAddressLine(b), "da", { sensitivity: "base" });
      break;
    case "status": {
      const la = LEAD_STATUS_LABELS[a.status as LeadStatus] ?? a.status;
      const lb = LEAD_STATUS_LABELS[b.status as LeadStatus] ?? b.status;
      cmp = la.localeCompare(lb, "da", { sensitivity: "base" });
      break;
    }
    case "campaign": {
      const ca = a.campaign?.name?.trim() || "";
      const cb = b.campaign?.name?.trim() || "";
      cmp = ca.localeCompare(cb, "da", { sensitivity: "base" });
      break;
    }
    case "phone": {
      const na = (a.phone ?? "").replace(/\D/g, "");
      const nb = (b.phone ?? "").replace(/\D/g, "");
      if (!na && !nb) cmp = 0;
      else if (!na) cmp = 1;
      else if (!nb) cmp = -1;
      else {
        try {
          const ba = BigInt(na);
          const bb = BigInt(nb);
          cmp = ba < bb ? -1 : ba > bb ? 1 : 0;
        } catch {
          cmp = na.localeCompare(nb, undefined, { numeric: true });
        }
      }
      break;
    }
    case "imported": {
      const ta = a.importedAt ? new Date(a.importedAt).getTime() : 0;
      const tb = b.importedAt ? new Date(b.importedAt).getTime() : 0;
      cmp = ta - tb;
      break;
    }
  }
  return dir === "asc" ? cmp : -cmp;
}

function defaultDirForColumn(key: SortColumn): "asc" | "desc" {
  return key === "imported" ? "desc" : "asc";
}

function dynamicDefaultDir(kind: DynamicFieldKind): "asc" | "desc" {
  return kind === "date" ? "desc" : "asc";
}

function isNumericLike(v: string): boolean {
  const digits = v.replace(/\D/g, "");
  return digits.length > 0;
}

function toNumberLike(v: string): number {
  const digits = v.replace(/\D/g, "");
  if (!digits) return Number.NaN;
  const n = Number(digits);
  return Number.isFinite(n) ? n : Number.NaN;
}


function normalizeText(v: string): string {
  return v.trim().toLocaleLowerCase("da");
}

function sortSummary(key: SortColumn | null, dir: "asc" | "desc"): string {
  if (!key) {
    return "Standard: uden udfald først, derefter ældste udfald først (fra server). Klik på en titel for at sortere.";
  }
  const d = dir === "asc" ? "stigende" : "faldende";
  switch (key) {
    case "company":
      return `Virksomhed A–Å (${d})`;
    case "address":
      return `Adresse alfabetisk (${d})`;
    case "status":
      return `Status alfabetisk (${d})`;
    case "campaign":
      return `Kampagne alfabetisk (${d})`;
    case "phone":
      return `Telefon numerisk (${d})`;
    case "imported":
      return dir === "desc" ? "Tilføjet: nyeste først" : "Tilføjet: ældste først";
  }
}

type LeadsBulkPanelProps = {
  /** `null` = alle leads i systemet (kræver typisk `showCampaignColumn`). */
  campaignId: string | null;
  /** Styret søgning (fx fra Leads-siden) */
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  /** Vis søgefelt i panelet (fx på kampagne-layout når der ikke er felt udenfor) */
  showSearchField?: boolean;
  /** Vis kolumnen «Kampagne» (kun på oversigten over alle kampagner) */
  showCampaignColumn?: boolean;
  /** Tilføjes til link til lead-detalje, fx ?fromCampaign=... */
  leadDetailSearchSuffix?: string;
  /** Vis udvidede filtre (dato + status). */
  showFilters?: boolean;
};

export function LeadsBulkPanel({
  campaignId,
  searchQuery: controlledSearch,
  onSearchChange,
  showSearchField = false,
  showCampaignColumn = false,
  leadDetailSearchSuffix = "",
  showFilters = true,
}: LeadsBulkPanelProps) {
  const { data: session } = useSession();
  const myUserId = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";

  const [internalQ, setInternalQ] = useState("");
  const q = controlledSearch !== undefined ? controlledSearch : internalQ;
  const setQ = onSearchChange ?? setInternalQ;

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [outcomeForIds, setOutcomeForIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addedToday, setAddedToday] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  /** Planlagt møde (`meetingScheduledFor`) — serverfilter, kalenderdato (København). */
  const [filterMeetingStart, setFilterMeetingStart] = useState(
    () => initialWorkspaceStartFilterFromStorage(campaignId).enabled,
  );
  const [campaignFilterMode, setCampaignFilterMode] = useState<"startdate" | "industry">("startdate");
  const [meetingStartFrom, setMeetingStartFrom] = useState(
    () => initialWorkspaceStartFilterFromStorage(campaignId).from,
  );
  const [meetingStartTo, setMeetingStartTo] = useState(
    () => initialWorkspaceStartFilterFromStorage(campaignId).to,
  );
  const [campaignIndustryOptions, setCampaignIndustryOptions] = useState<string[]>([]);
  const [selectedCampaignIndustries, setSelectedCampaignIndustries] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ANY" | "NO_OUTCOME" | LeadStatus>("ANY");
  const [excludeNotInterested, setExcludeNotInterested] = useState(false);
  const [dynamicSortFieldId, setDynamicSortFieldId] = useState("");
  const [dynamicSortDir, setDynamicSortDir] = useState<"asc" | "desc">("asc");
  const [dynamicFromDate, setDynamicFromDate] = useState("");
  const [dynamicToDate, setDynamicToDate] = useState("");
  const [dynamicDateInvert, setDynamicDateInvert] = useState(false);
  const [campaignFieldConfigRaw, setCampaignFieldConfigRaw] = useState<string>("");
  const [prefsSavedMessage, setPrefsSavedMessage] = useState("");

  const startDateExtensionField = useMemo(() => {
    if (!campaignId || !campaignFieldConfigRaw.trim()) return null;
    return findStartDateExtensionField(parseFieldConfig(campaignFieldConfigRaw));
  }, [campaignId, campaignFieldConfigRaw]);

  useEffect(() => {
    setSelected(new Set());
    setSortKey(null);
    setSortDir("desc");
    if (!campaignId) {
      setFilterMeetingStart(false);
      setMeetingStartFrom("");
      setMeetingStartTo("");
      setCampaignFilterMode("startdate");
      setCampaignIndustryOptions([]);
      setSelectedCampaignIndustries([]);
      setDynamicSortFieldId("");
      setDynamicSortDir("asc");
      setDynamicFromDate("");
      setDynamicToDate("");
      setDynamicDateInvert(false);
      setPrefsSavedMessage("");
      return;
    }
    const prefs = readCampaignLeadViewPrefs(campaignId);
    if (prefs) {
      setFilterMeetingStart(prefs.filterMeetingStart);
      setCampaignFilterMode(prefs.campaignFilterMode);
      setMeetingStartFrom(prefs.meetingStartFrom);
      setMeetingStartTo(prefs.meetingStartTo);
      setSelectedCampaignIndustries(prefs.selectedCampaignIndustries);
      setDynamicSortFieldId(prefs.dynamicSortFieldId);
      setDynamicSortDir(prefs.dynamicSortDir);
      setDynamicFromDate(prefs.dynamicFromDate);
      setDynamicToDate(prefs.dynamicToDate);
      setDynamicDateInvert(prefs.dynamicDateInvert);
    } else {
      const stored = readWorkspaceStartDateFilter(campaignId);
      if (stored) {
        setFilterMeetingStart(stored.enabled);
        setMeetingStartFrom(stored.from);
        setMeetingStartTo(stored.to);
      } else {
        setFilterMeetingStart(false);
        setMeetingStartFrom("");
        setMeetingStartTo("");
      }
      setCampaignFilterMode("startdate");
      setSelectedCampaignIndustries([]);
      setDynamicSortFieldId("");
      setDynamicSortDir("asc");
      setDynamicFromDate("");
      setDynamicToDate("");
      setDynamicDateInvert(false);
    }
    setPrefsSavedMessage("");
  }, [campaignId]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/leads?campaignId=${encodeURIComponent(campaignId)}`);
      if (!res.ok || cancelled) return;
      const rows = (await res.json().catch(() => [])) as LeadRow[];
      if (!Array.isArray(rows)) return;
      const unique = Array.from(
        new Set(
          rows
            .map((r) => r.industry?.trim() ?? "")
            .filter((v) => v.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, "da", { sensitivity: "base" }));
      if (!cancelled) {
        setCampaignIndustryOptions(unique);
        setSelectedCampaignIndustries((prev) => prev.filter((p) => unique.includes(p)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshNonce]);

  /** Ved genbesøg med gemt filter: sæt sortering til startdato-felt (samme som når man slår filteret til). */
  useEffect(() => {
    if (!campaignId || !filterMeetingStart || !startDateExtensionField) return;
    setDynamicSortFieldId(`custom:${startDateExtensionField.key}`);
    setDynamicSortDir("asc");
  }, [campaignId, filterMeetingStart, startDateExtensionField]);

  useEffect(() => {
    let cancelled = false;
    const delay = q.trim() ? 300 : 0;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const qs = new URLSearchParams();
      if (campaignId) qs.set("campaignId", campaignId);
      if (q.trim()) qs.set("q", q.trim());
      if (addedToday) qs.set("addedToday", "1");
      if (!addedToday && fromDate) qs.set("fromDate", fromDate);
      if (!addedToday && toDate) qs.set("toDate", toDate);
      /** Kun planlagt møde i DB — når kampagnen har feltet «Start dato», filtreres i browser på customFields. */
      if (campaignId && filterMeetingStart && campaignFilterMode === "startdate" && !startDateExtensionField) {
        qs.set("filterByMeetingStart", "1");
        if (meetingStartFrom) qs.set("meetingStartFrom", meetingStartFrom);
        if (meetingStartTo) qs.set("meetingStartTo", meetingStartTo);
      }
      if (statusFilter !== "ANY") qs.set("status", statusFilter);
      if (excludeNotInterested) qs.set("excludeNotInterested", "1");
      const res = await fetch(`/api/leads?${qs.toString()}`);
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          typeof j.error === "string"
            ? j.error
            : res.status === 401
              ? "Ikke logget ind"
              : "Kunne ikke hente leads";
        setError(j.details && process.env.NODE_ENV === "development" ? `${msg} (${j.details})` : msg);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        setError("Uventet svar fra serveren.");
        setLoading(false);
        return;
      }
      setLeads(data);
      setLoading(false);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    q,
    campaignId,
    refreshNonce,
    addedToday,
    fromDate,
    toDate,
    filterMeetingStart,
    campaignFilterMode,
    meetingStartFrom,
    meetingStartTo,
    statusFilter,
    excludeNotInterested,
    startDateExtensionField,
  ]);

  useEffect(() => {
    if (!campaignId) {
      setCampaignFieldConfigRaw("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok || cancelled) return;
      const j = (await res.json().catch(() => ({}))) as { fieldConfig?: string };
      if (!cancelled) {
        setCampaignFieldConfigRaw(typeof j.fieldConfig === "string" ? j.fieldConfig : "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const dynamicSortFields = useMemo((): DynamicSortField[] => {
    const base: DynamicSortField[] = [
      { id: "companyName", label: "Virksomhedsnavn", kind: "text" },
      { id: "phone", label: "Telefonnummer", kind: "number" },
      { id: "email", label: "E-mail", kind: "text" },
      { id: "cvr", label: "CVR-nummer", kind: "number" },
      { id: "address", label: "Adresse", kind: "text" },
      { id: "postalCode", label: "Postnr.", kind: "number" },
      { id: "city", label: "By", kind: "text" },
      { id: "industry", label: "Branche", kind: "text" },
      { id: "notes", label: "Noter", kind: "text" },
      { id: "status", label: "Status", kind: "text" },
      { id: "importedAt", label: "Tilføjet", kind: "date" },
      { id: "lastOutcomeAt", label: "Sidst udfald ændret", kind: "date" },
      { id: "meetingScheduledFor", label: "Mødetid", kind: "date" },
    ];
    if (!campaignId) return base;
    const cfg = parseFieldConfig(campaignFieldConfigRaw);
    const custom: DynamicSortField[] = [];
    for (const g of FIELD_GROUPS) {
      for (const f of cfg.extensions[g] ?? []) {
        const raw = `${f.label} ${f.key}`.toLowerCase();
        const kind: DynamicFieldKind =
          raw.includes("dato") || raw.includes("date")
            ? "date"
            : raw.includes("telefon") || raw.includes("tlf") || raw.includes("cvr") || raw.includes("nummer")
              ? "number"
              : "text";
        custom.push({ id: `custom:${f.key}`, label: `${FIELD_GROUP_LABELS[g]} → ${f.label}`, kind });
      }
    }
    return [...base, ...custom];
  }, [campaignId, campaignFieldConfigRaw]);

  const selectedDynamicField = useMemo(
    () => dynamicSortFields.find((f) => f.id === dynamicSortFieldId) ?? null,
    [dynamicSortFields, dynamicSortFieldId],
  );

  const sortedLeads = useMemo(() => {
    const getDynamicValue = (l: LeadRow, fieldId: string): string => {
      if (fieldId.startsWith("custom:")) {
        const key = fieldId.slice("custom:".length);
        return parseCustomFields(l.customFields ?? "")[key] ?? "";
      }
      const v = (l as Record<string, unknown>)[fieldId];
      return typeof v === "string" ? v : v == null ? "" : String(v);
    };

    let out = leads;

    if (
      campaignId &&
      filterMeetingStart &&
      campaignFilterMode === "startdate" &&
      startDateExtensionField &&
      (meetingStartFrom || meetingStartTo)
    ) {
      out = out.filter((l) => {
        const raw = parseCustomFields(l.customFields ?? "")[startDateExtensionField.key] ?? "";
        const ms = parseDateStringLoose(raw);
        if (ms == null) return false;
        const key = localDayKeyFromMs(ms);
        if (meetingStartFrom && key < meetingStartFrom) return false;
        if (meetingStartTo && key > meetingStartTo) return false;
        return true;
      });
    }

    if (campaignId && filterMeetingStart && campaignFilterMode === "industry") {
      if (selectedCampaignIndustries.length === 0) {
        out = [];
      } else {
        const selected = new Set(selectedCampaignIndustries.map((v) => v.toLocaleLowerCase("da")));
        out = out.filter((l) => {
          const normalized = (l.industry ?? "").trim().toLocaleLowerCase("da");
          return normalized.length > 0 && selected.has(normalized);
        });
      }
    }

    if (selectedDynamicField && selectedDynamicField.kind === "date" && (dynamicFromDate || dynamicToDate)) {
      out = out.filter((l) => {
        const t = timestampForSort(getDynamicValue(l, selectedDynamicField.id));
        if (!Number.isFinite(t)) return dynamicDateInvert;
        let inRange = true;
        if (dynamicFromDate) {
          const from = new Date(`${dynamicFromDate}T00:00:00`).getTime();
          if (Number.isFinite(from) && t < from) inRange = false;
        }
        if (dynamicToDate) {
          const to = new Date(`${dynamicToDate}T23:59:59.999`).getTime();
          if (Number.isFinite(to) && t > to) inRange = false;
        }
        return dynamicDateInvert ? !inRange : inRange;
      });
    }

    if (selectedDynamicField) {
      const dirMul = dynamicSortDir === "asc" ? 1 : -1;
      return [...out].sort((a, b) => {
        const av = getDynamicValue(a, selectedDynamicField.id);
        const bv = getDynamicValue(b, selectedDynamicField.id);
        if (selectedDynamicField.kind === "date") {
          const at = timestampForSort(av);
          const bt = timestampForSort(bv);
          const aHas = Number.isFinite(at);
          const bHas = Number.isFinite(bt);
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas && at !== bt) return (at - bt) * dirMul;
          return a.id.localeCompare(b.id);
        }
        if (selectedDynamicField.kind === "number" || (isNumericLike(av) && isNumericLike(bv))) {
          const an = toNumberLike(av);
          const bn = toNumberLike(bv);
          const aHas = Number.isFinite(an);
          const bHas = Number.isFinite(bn);
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas && an !== bn) return (an - bn) * dirMul;
          return a.id.localeCompare(b.id);
        }
        const cmp = normalizeText(av).localeCompare(normalizeText(bv), "da", { sensitivity: "base" });
        if (cmp !== 0) return cmp * dirMul;
        return a.id.localeCompare(b.id);
      });
    }

    if (!sortKey) return out;
    return [...out].sort((a, b) => compareLeads(a, b, sortKey, sortDir));
  }, [
    leads,
    sortKey,
    sortDir,
    selectedDynamicField,
    dynamicSortDir,
    dynamicFromDate,
    dynamicToDate,
    dynamicDateInvert,
    campaignId,
    filterMeetingStart,
    campaignFilterMode,
    startDateExtensionField,
    meetingStartFrom,
    meetingStartTo,
    selectedCampaignIndustries,
  ]);

  const middleColumnLabel = selectedDynamicField?.label ?? "Adresse";
  const middleColumnValue = (l: LeadRow): string => {
    if (!selectedDynamicField) return formatAddressLine(l);
    const getDynamicValue = (row: LeadRow, fieldId: string): string => {
      if (fieldId.startsWith("custom:")) {
        const key = fieldId.slice("custom:".length);
        return parseCustomFields(row.customFields ?? "")[key] ?? "";
      }
      const v = (row as Record<string, unknown>)[fieldId];
      return typeof v === "string" ? v : v == null ? "" : String(v);
    };
    const raw = getDynamicValue(l, selectedDynamicField.id);
    if (!raw) return "—";
    if (selectedDynamicField.kind === "date") return formatDateCell(raw);
    return raw;
  };

  function onSortColumnClick(column: SortColumn) {
    if (sortKey === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column);
      setSortDir(defaultDirForColumn(column));
    }
  }

  const visibleIds = useMemo(() => sortedLeads.map((l) => l.id), [sortedLeads]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [visibleIds, allSelected]);

  const selectedOne = selected.size === 1 ? leads.find((l) => l.id === [...selected][0]) : undefined;
  const selectedIdsInView = sortedLeads.filter((l) => selected.has(l.id)).map((l) => l.id);
  async function onDeleteSelected() {
    if (!isAdmin || deleting || selectedIdsInView.length === 0) return;
    const confirmed = window.confirm(
      `Er du sikker på, at du vil slette ${selectedIdsInView.length} lead${selectedIdsInView.length > 1 ? "s" : ""}? Dette kan ikke fortrydes.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/leads/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIdsInView }),
    });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke slette leads");
      return;
    }
    setSelected(new Set());
    setRefreshNonce((n) => n + 1);
  }
  function leadOpenHref(lead: LeadRow): string {
    if (campaignId) {
      return `/kampagner/${encodeURIComponent(campaignId)}/arbejd?leadId=${encodeURIComponent(lead.id)}`;
    }
    return `/leads/${lead.id}${leadDetailSearchSuffix || ""}`;
  }
  const actionsBtnClass =
    "rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50";

  const colCount = (showCampaignColumn ? 7 : 6) + (isAdmin ? 1 : 0);

  const tableContainerClass = campaignId
    ? "max-h-[58vh] overflow-x-auto overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-sm"
    : "overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {showSearchField && (
          <input
            type="search"
            placeholder="Søg i leads…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full min-w-[200px] rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 sm:max-w-xs"
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-stone-500">{sortSummary(sortKey, sortDir)}</span>
          {selectedOne && (
            <Link
              href={leadOpenHref(selectedOne)}
              className={actionsBtnClass}
            >
              Åbn lead
            </Link>
          )}
          {selected.size >= 1 && (
            <button
              type="button"
              onClick={() => {
                setOutcomeForIds(selectedIdsInView);
              }}
              className={actionsBtnClass}
            >
              Ændre udfald{selected.size > 1 ? ` (${selected.size})` : ""}
            </button>
          )}
          {isAdmin && selected.size >= 1 && (
            <button
              type="button"
              onClick={() => void onDeleteSelected()}
              disabled={deleting}
              className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? "Sletter…" : `Slet leads${selected.size > 1 ? ` (${selected.size})` : ""}`}
            </button>
          )}
        </div>
      </div>
      {showFilters && (
        <div className="flex flex-col gap-2 rounded-md border border-stone-200 bg-stone-50/70 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="inline-flex items-center gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={addedToday}
              onChange={(e) => setAddedToday(e.target.checked)}
              className="rounded border-stone-300"
            />
            Tilføjet i dag
          </label>
          <label className="text-xs text-stone-700">
            Tilføjet fra
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={addedToday}
              className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
            />
          </label>
          <label className="text-xs text-stone-700">
            Tilføjet til
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={addedToday}
              className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
            />
          </label>
          {campaignId && (
            <div className="flex flex-col gap-1 rounded-md border border-dashed border-stone-300 bg-white/80 px-2 py-2 sm:min-w-[14rem]">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-800">
                <input
                  type="checkbox"
                  checked={filterMeetingStart}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setFilterMeetingStart(on);
                    if (campaignId) {
                      writeWorkspaceStartDateFilter(campaignId, {
                        enabled: on,
                        from: meetingStartFrom,
                        to: meetingStartTo,
                      });
                    }
                    if (on && startDateExtensionField) {
                      setDynamicSortFieldId(`custom:${startDateExtensionField.key}`);
                      setDynamicSortDir("asc");
                    }
                  }}
                  className="rounded border-stone-300"
                />
                Filtrér på kampagnefelt
              </label>
              <label className="text-xs text-stone-700">
                Filtertype
                <select
                  value={campaignFilterMode}
                  onChange={(e) => setCampaignFilterMode(e.target.value === "industry" ? "industry" : "startdate")}
                  disabled={!filterMeetingStart}
                  className="mt-1 block min-w-[11rem] rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
                >
                  <option value="startdate">Startdato</option>
                  <option value="industry">Branche</option>
                </select>
              </label>
              {campaignFilterMode === "startdate" ? (
                <>
                  <p className="text-[11px] leading-snug text-stone-500">
                    {startDateExtensionField ? (
                      <>
                        Bruger kampagnefeltet «{startDateExtensionField.label}» (værdier som{" "}
                        <span className="font-mono">dd.mm.åååå</span>). Sortering sættes til det felt, når du
                        slår filteret til.
                      </>
                    ) : (
                      <>
                        Ingen «Start dato»-kolonne i kampagne-layout: bruger i stedet{" "}
                        <strong>planlagt møde</strong> (mødetid). Dato efter kalenderdag i Danmark.
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <label className="text-xs text-stone-700">
                      Fra
                      <input
                        type="date"
                        value={meetingStartFrom}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMeetingStartFrom(v);
                          if (campaignId) {
                            writeWorkspaceStartDateFilter(campaignId, {
                              enabled: filterMeetingStart,
                              from: v,
                              to: meetingStartTo,
                            });
                          }
                        }}
                        disabled={!filterMeetingStart}
                        className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
                      />
                    </label>
                    <label className="text-xs text-stone-700">
                      Til
                      <input
                        type="date"
                        value={meetingStartTo}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMeetingStartTo(v);
                          if (campaignId) {
                            writeWorkspaceStartDateFilter(campaignId, {
                              enabled: filterMeetingStart,
                              from: meetingStartFrom,
                              to: v,
                            });
                          }
                        }}
                        disabled={!filterMeetingStart}
                        className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <div className="max-h-40 min-w-[16rem] overflow-auto rounded-md border border-stone-200 bg-white p-2">
                  {campaignIndustryOptions.length === 0 ? (
                    <p className="text-xs text-stone-500">Ingen brancher fundet i kampagnen.</p>
                  ) : (
                    <div className="space-y-1">
                      {campaignIndustryOptions.map((industry) => {
                        const checked = selectedCampaignIndustries.includes(industry);
                        return (
                          <label key={industry} className="flex items-center gap-2 text-xs text-stone-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const on = e.target.checked;
                                setSelectedCampaignIndustries((prev) =>
                                  on ? [...prev, industry] : prev.filter((v) => v !== industry),
                                );
                              }}
                              disabled={!filterMeetingStart}
                              className="rounded border-stone-300"
                            />
                            {industry}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <label className="text-xs text-stone-700">
            Udfald/status
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target.value as LeadStatus | "ANY" | "NO_OUTCOME") ?? "ANY")
              }
              className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900"
            >
              <option value="ANY">Alle</option>
              <option value="NO_OUTCOME">Uden udfald</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={excludeNotInterested}
              onChange={(e) => setExcludeNotInterested(e.target.checked)}
              className="rounded border-stone-300"
            />
            Ekskluder ikke interesseret
          </label>
          <label className="text-xs text-stone-700">
            Sorter i filter
            <select
              value={dynamicSortFieldId}
              onChange={(e) => {
                const id = e.target.value;
                setDynamicSortFieldId(id);
                const field = dynamicSortFields.find((f) => f.id === id);
                if (field) setDynamicSortDir(dynamicDefaultDir(field.kind));
                setDynamicFromDate("");
                setDynamicToDate("");
                setDynamicDateInvert(false);
              }}
              className="mt-1 block min-w-[15rem] rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900"
            >
              <option value="">Ingen</option>
              {dynamicSortFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-700">
            Retning
            <select
              value={dynamicSortDir}
              onChange={(e) => setDynamicSortDir(e.target.value === "asc" ? "asc" : "desc")}
              disabled={!selectedDynamicField}
              className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
            >
              <option value="asc">Stigende</option>
              <option value="desc">Faldende</option>
            </select>
          </label>
          {selectedDynamicField?.kind === "date" && (
            <>
              <label className="text-xs text-stone-700">
                Fra (valgt felt)
                <input
                  type="date"
                  value={dynamicFromDate}
                  onChange={(e) => setDynamicFromDate(e.target.value)}
                  className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900"
                />
              </label>
              <label className="text-xs text-stone-700">
                Til (valgt felt)
                <input
                  type="date"
                  value={dynamicToDate}
                  onChange={(e) => setDynamicToDate(e.target.value)}
                  className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-stone-700">
                <input
                  type="checkbox"
                  checked={dynamicDateInvert}
                  onChange={(e) => setDynamicDateInvert(e.target.checked)}
                  className="rounded border-stone-300"
                />
                Invertér interval (vis alle undtagen i spændet)
              </label>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (!campaignId) return;
              writeCampaignLeadViewPrefs(campaignId, {
                filterMeetingStart,
                campaignFilterMode,
                meetingStartFrom,
                meetingStartTo,
                selectedCampaignIndustries,
                dynamicSortFieldId,
                dynamicSortDir,
                dynamicFromDate,
                dynamicToDate,
                dynamicDateInvert,
              });
              setPrefsSavedMessage("Gemte filter/sortering for denne kampagne.");
            }}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Gem filter/sortering
          </button>
          <button
            type="button"
            onClick={() => {
              setAddedToday(false);
              setFromDate("");
              setToDate("");
              setFilterMeetingStart(false);
              setCampaignFilterMode("startdate");
              setMeetingStartFrom("");
              setMeetingStartTo("");
              setSelectedCampaignIndustries([]);
              if (campaignId) clearWorkspaceStartDateFilter(campaignId);
              if (campaignId) clearCampaignLeadViewPrefs(campaignId);
              setStatusFilter("ANY");
              setExcludeNotInterested(false);
              setDynamicSortFieldId("");
              setDynamicFromDate("");
              setDynamicToDate("");
              setDynamicDateInvert(false);
              setPrefsSavedMessage("");
            }}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Nulstil filtre
          </button>
          {prefsSavedMessage && <p className="text-xs text-emerald-700">{prefsSavedMessage}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className={tableContainerClass}>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="w-10 px-2 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={loading || leads.length === 0}
                  className="rounded border-stone-300"
                  title="Vælg alle"
                />
              </th>
              <th className="px-2 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSortColumnClick("company")}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  Virksomhed
                  {sortKey === "company" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              </th>
              <th className="px-2 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSortColumnClick("phone")}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  Telefon
                  {sortKey === "phone" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              </th>
              <th className="hidden px-2 py-3 font-medium md:table-cell">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDynamicField) return;
                    onSortColumnClick("address");
                  }}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  {middleColumnLabel}
                  {!selectedDynamicField && sortKey === "address" && (
                    <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="px-2 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSortColumnClick("status")}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  Status
                  {sortKey === "status" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              </th>
              {showCampaignColumn && (
                <th className="px-2 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => onSortColumnClick("campaign")}
                    className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                  >
                    Kampagne
                    {sortKey === "campaign" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              )}
              {isAdmin && <th className="px-2 py-3 font-medium">Sidst udfald</th>}
              <th className="px-2 py-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSortColumnClick("imported")}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  Tilføjet
                  {sortKey === "imported" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : leads.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-8 text-center text-stone-500">
                  {q.trim()
                    ? "Ingen leads matcher søgningen."
                    : campaignId
                      ? "Ingen leads i denne kampagne. Importer CSV eller opret nyt."
                      : "Ingen leads endnu. Importer CSV eller opret nyt under en kampagne."}
                </td>
              </tr>
            ) : (
              sortedLeads.map((l) => (
                <tr
                  key={l.id}
                  className={
                    l.status === "NOT_INTERESTED" || l.status === "UNQUALIFIED"
                      ? "bg-red-50/90 hover:bg-red-50 border-l-4 border-l-red-600"
                      : "hover:bg-stone-50/80"
                  }
                >
                  <td className="px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      className="rounded border-stone-300"
                    />
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={leadOpenHref(l)}
                        className={`font-medium underline-offset-2 hover:underline ${
                          isLockedByAnotherUser(l, myUserId)
                            ? "text-amber-900/90"
                            : "text-stone-900"
                        }`}
                      >
                        {l.companyName}
                      </Link>
                      {isLockedByAnotherUser(l, myUserId) && (
                        <span className="text-xs text-amber-800">
                          Optaget ({l.lockedByUser?.name ?? "kollega"})
                        </span>
                      )}
                      {isLockedByMe(l, myUserId) && (
                        <span className="text-xs text-emerald-800">Du arbejder på dette lead</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-stone-700">
                    {l.phone?.trim() ? l.phone : <span className="text-stone-400">—</span>}
                  </td>
                  <td className="hidden max-w-xs truncate px-2 py-3 text-stone-600 md:table-cell">
                    {middleColumnValue(l)}
                  </td>
                  <td
                    className={
                      l.status === "NOT_INTERESTED" || l.status === "UNQUALIFIED"
                        ? "px-2 py-3 font-medium text-red-900"
                        : "px-2 py-3 text-stone-700"
                    }
                  >
                    {LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status}
                  </td>
                  {showCampaignColumn && (
                    <td className="px-2 py-3 text-stone-600">
                      {l.campaign?.name ?? "—"}
                    </td>
                  )}
                  {isAdmin && (
                    <td className="whitespace-nowrap px-2 py-3 text-stone-500">
                      {l.lastOutcomeAt ? new Date(l.lastOutcomeAt).toLocaleString("da-DK") : "Intet endnu"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-2 py-3 text-stone-500">
                    {l.importedAt
                      ? new Date(l.importedAt).toLocaleDateString("da-DK")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {outcomeForIds && outcomeForIds.length > 0 && (() => {
        const first = leads.find((l) => l.id === outcomeForIds[0]);
        if (!first) return null;
        return (
          <LeadOutcomeModal
            open
            onClose={() => setOutcomeForIds(null)}
            leadIds={outcomeForIds}
            initialStatus={
              (LEAD_STATUSES as readonly string[]).includes(first.status)
                ? (first.status as LeadStatus)
                : "NEW"
            }
            initialMeetingLocal={meetingToLocalInput(first.meetingScheduledFor)}
            onSaved={() => {
              setOutcomeForIds(null);
              setSelected(new Set());
              setRefreshNonce((n) => n + 1);
            }}
          />
        );
      })()}
    </div>
  );
}

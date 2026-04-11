"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { LeadOutcomeModal } from "@/app/components/lead-outcome-modal";
import { isLockActive } from "@/lib/lead-lock";
import { parseCustomFields } from "@/lib/custom-fields";
import { parseFieldConfig, FIELD_GROUPS, FIELD_GROUP_LABELS } from "@/lib/campaign-fields";

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

type SortColumn = "company" | "phone" | "address" | "status" | "imported";

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

function toDateLike(v: string): number {
  const n = new Date(v).getTime();
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
  const [deleting, setDeleting] = useState(false);
  const [sortKey, setSortKey] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [outcomeForIds, setOutcomeForIds] = useState<string[] | null>(null);
  const [addedToday, setAddedToday] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  /** Planlagt møde (`meetingScheduledFor`) — serverfilter, kalenderdato (København). */
  const [filterMeetingStart, setFilterMeetingStart] = useState(false);
  const [meetingStartFrom, setMeetingStartFrom] = useState("");
  const [meetingStartTo, setMeetingStartTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ANY" | "NO_OUTCOME" | LeadStatus>("ANY");
  const [excludeNotInterested, setExcludeNotInterested] = useState(false);
  const [dynamicSortFieldId, setDynamicSortFieldId] = useState("");
  const [dynamicSortDir, setDynamicSortDir] = useState<"asc" | "desc">("asc");
  const [dynamicFromDate, setDynamicFromDate] = useState("");
  const [dynamicToDate, setDynamicToDate] = useState("");
  const [dynamicDateInvert, setDynamicDateInvert] = useState(false);
  const [campaignFieldConfigRaw, setCampaignFieldConfigRaw] = useState<string>("");

  useEffect(() => {
    setSelected(new Set());
    setSortKey(null);
    setSortDir("desc");
  }, [campaignId]);

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
      if (filterMeetingStart) {
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
    meetingStartFrom,
    meetingStartTo,
    statusFilter,
    excludeNotInterested,
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
    if (selectedDynamicField && selectedDynamicField.kind === "date" && (dynamicFromDate || dynamicToDate)) {
      out = out.filter((l) => {
        const t = toDateLike(getDynamicValue(l, selectedDynamicField.id));
        if (!Number.isFinite(t)) return dynamicDateInvert;
        let inRange = true;
        if (dynamicFromDate) {
          const from = toDateLike(`${dynamicFromDate}T00:00:00`);
          if (Number.isFinite(from) && t < from) inRange = false;
        }
        if (dynamicToDate) {
          const to = toDateLike(`${dynamicToDate}T23:59:59.999`);
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
          const at = toDateLike(av);
          const bt = toDateLike(bv);
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
  }, [leads, sortKey, sortDir, selectedDynamicField, dynamicSortDir, dynamicFromDate, dynamicToDate, dynamicDateInvert]);

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

  async function onBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!confirm(`Slet ${ids.length} lead(s)? Dette kan ikke fortrydes.`)) return;
    setDeleting(true);
    setError(null);
    const res = await fetch("/api/leads/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setDeleting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke slette");
      return;
    }
    const remove = new Set(ids);
    setSelected(new Set());
    setLeads((prev) => prev.filter((l) => !remove.has(l.id)));
  }

  const selectedOne = selected.size === 1 ? leads.find((l) => l.id === [...selected][0]) : undefined;
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
                const ids = sortedLeads.filter((l) => selected.has(l.id)).map((l) => l.id);
                setOutcomeForIds(ids);
              }}
              className={actionsBtnClass}
            >
              Ændre udfald{selected.size > 1 ? ` (${selected.size})` : ""}
            </button>
          )}
          <button
            type="button"
            disabled={selected.size === 0 || deleting}
            onClick={() => void onBulkDelete()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Sletter…" : `Slet valgte (${selected.size})`}
          </button>
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
          <div className="flex flex-col gap-1 rounded-md border border-dashed border-stone-300 bg-white/80 px-2 py-2 sm:min-w-[14rem]">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-stone-800">
              <input
                type="checkbox"
                checked={filterMeetingStart}
                onChange={(e) => setFilterMeetingStart(e.target.checked)}
                className="rounded border-stone-300"
              />
              Filtrér på møde-startdato
            </label>
            <p className="text-[11px] leading-snug text-stone-500">
              Kun leads med planlagt møde; dato (ikke klokkeslæt) i forhold til kalenderdag i Danmark.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="text-xs text-stone-700">
                Fra
                <input
                  type="date"
                  value={meetingStartFrom}
                  onChange={(e) => setMeetingStartFrom(e.target.value)}
                  disabled={!filterMeetingStart}
                  className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
                />
              </label>
              <label className="text-xs text-stone-700">
                Til
                <input
                  type="date"
                  value={meetingStartTo}
                  onChange={(e) => setMeetingStartTo(e.target.value)}
                  disabled={!filterMeetingStart}
                  className="mt-1 block rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 disabled:opacity-60"
                />
              </label>
            </div>
          </div>
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
              setAddedToday(false);
              setFromDate("");
              setToDate("");
              setFilterMeetingStart(false);
              setMeetingStartFrom("");
              setMeetingStartTo("");
              setStatusFilter("ANY");
              setExcludeNotInterested(false);
              setDynamicSortFieldId("");
              setDynamicFromDate("");
              setDynamicToDate("");
              setDynamicDateInvert(false);
            }}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Nulstil filtre
          </button>
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
              {showCampaignColumn && <th className="px-2 py-3 font-medium">Kampagne</th>}
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { LeadOutcomeModal } from "@/app/components/lead-outcome-modal";

type LeadRow = {
  id: string;
  companyName: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
  status: string;
  importedAt: string;
  /** Fra API (til udfalds-modal) */
  meetingScheduledFor?: string | null;
  campaign?: { id: string; name: string };
  lockedByUserId?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { id: string; name: string; username: string } | null;
};

function lockActive(l: Pick<LeadRow, "lockExpiresAt">): boolean {
  if (!l.lockExpiresAt) return false;
  return new Date(l.lockExpiresAt).getTime() > Date.now();
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

function sortSummary(key: SortColumn | null, dir: "asc" | "desc"): string {
  if (!key) return "Standard: senest tilføjet først (fra server). Klik på en titel for at sortere.";
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
};

export function LeadsBulkPanel({
  campaignId,
  searchQuery: controlledSearch,
  onSearchChange,
  showSearchField = false,
  showCampaignColumn = false,
  leadDetailSearchSuffix = "",
}: LeadsBulkPanelProps) {
  const { data: session } = useSession();
  const myUserId = session?.user?.id;

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
  }, [q, campaignId, refreshNonce]);

  useEffect(() => {
    if (!campaignId) return;
    const t = window.setInterval(() => setRefreshNonce((n) => n + 1), 20_000);
    return () => clearInterval(t);
  }, [campaignId]);

  const sortedLeads = useMemo(() => {
    if (!sortKey) return leads;
    return [...leads].sort((a, b) => compareLeads(a, b, sortKey, sortDir));
  }, [leads, sortKey, sortDir]);

  function onSortColumnClick(column: SortColumn) {
    if (sortKey === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(column);
      setSortDir(defaultDirForColumn(column));
    }
  }

  const allIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allIds));
  }, [allIds, allSelected]);

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
  const actionsBtnClass =
    "rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50";

  const colCount = showCampaignColumn ? 7 : 6;

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
              href={`/leads/${selectedOne.id}${leadDetailSearchSuffix || ""}`}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white shadow-sm">
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
                  onClick={() => onSortColumnClick("address")}
                  className="-mx-1 flex w-full items-center gap-0.5 rounded px-1 text-left font-medium text-stone-700 hover:bg-stone-200/80 hover:text-stone-900"
                >
                  Adresse
                  {sortKey === "address" && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
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
                    l.status === "NOT_INTERESTED"
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
                        href={`/leads/${l.id}${leadDetailSearchSuffix || ""}`}
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
                    {formatAddressLine(l)}
                  </td>
                  <td
                    className={
                      l.status === "NOT_INTERESTED"
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
                  <td className="whitespace-nowrap px-2 py-3 text-stone-500">
                    {l.importedAt
                      ? new Date(l.importedAt).toLocaleString("da-DK")
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

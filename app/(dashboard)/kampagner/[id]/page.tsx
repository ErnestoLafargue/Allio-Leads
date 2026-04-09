"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { asSingleParam } from "@/lib/route-params";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  type FieldGroupKey,
  type CampaignExtraField,
  isFixedCvrExtensionKey,
  isFixedPersonExtensionKey,
  parseFieldConfig,
  serializeFieldConfig,
  slugifyKey,
} from "@/lib/campaign-fields";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STATS_ORDER,
  LEAD_STATUS_COUNT_BADGE_CLASS,
  type LeadStatus,
  isLeadStatus,
} from "@/lib/lead-status";
import { LeadsBulkPanel } from "@/app/components/leads-bulk-panel";
import { CampaignProtectedSwitch } from "@/app/components/campaign-protected-switch";
import { CampaignDeleteFlow } from "@/app/components/campaign-delete-flow";
import {
  canDeleteCampaign,
  PROTECTED_CAMPAIGN_DELETE_MESSAGE,
} from "@/lib/campaign-delete";
import {
  getReklamebeskyttetNormalized,
  leadIncludedForCampaignProtectedSetting,
} from "@/lib/reklamebeskyttet-filter";

/** Samme gruppering som i lead-formular: vej + postnr + by i én ramme. */
const KAMPAGNE_FORM_GROUPS = FIELD_GROUPS.filter((g) => g !== "postalCode" && g !== "city");
const ADDRESS_SUB_GROUPS = ["address", "postalCode", "city"] as const satisfies readonly FieldGroupKey[];

type Row = CampaignExtraField & { draftId: string };

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function RedigerKampagnePage() {
  const params = useParams<{ id: string }>();
  const id = asSingleParam(params.id);
  const router = useRouter();
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [includeProtectedBusinesses, setIncludeProtectedBusinesses] = useState(false);
  const [ext, setExt] = useState<Record<FieldGroupKey, Row[]>>(() => ({
    companyName: [],
    phone: [],
    email: [],
    cvr: [],
    address: [],
    postalCode: [],
    city: [],
    industry: [],
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignMeta, setCampaignMeta] = useState<{
    name: string;
    isSystemCampaign: boolean;
    systemCampaignType: string | null;
  } | null>(null);

  const [outcomeStats, setOutcomeStats] = useState<{
    byStatus: Record<LeadStatus, number>;
    protectedCount: number;
    /** «Ny» der medtages når reklamebeskyttede er filtreret fra (ikke eksplicit ja + uden udfald = status NEW). */
    newCountWhenExcludingProtected: number;
  } | null>(null);

  const [exportFormat, setExportFormat] = useState<"csv" | "xlsx">("xlsx");
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const isAdmin = session?.user.role === "ADMIN";

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) {
      router.replace("/kampagner");
    }
  }, [isAdmin, router, status]);

  useEffect(() => {
    if (!isAdmin || !id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/campaigns/${id}`);
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const c = await res.json();
      if (cancelled) return;
      setName(c.name);
      setCampaignMeta({
        name: c.name,
        isSystemCampaign: Boolean(c.isSystemCampaign),
        systemCampaignType:
          typeof c.systemCampaignType === "string" && c.systemCampaignType.trim()
            ? c.systemCampaignType.trim()
            : null,
      });
      setIncludeProtectedBusinesses(Boolean(c.includeProtectedBusinesses));
      const cfg = parseFieldConfig(c.fieldConfig);
      const next: Record<FieldGroupKey, Row[]> = {
        companyName: [],
        phone: [],
        email: [],
        cvr: [],
        address: [],
        postalCode: [],
        city: [],
        industry: [],
      };
      for (const g of FIELD_GROUPS) {
        const list = cfg.extensions[g] ?? [];
        next[g] = list.map((f) => ({ ...f, draftId: uid() }));
      }
      setExt(next);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isAdmin]);

  useEffect(() => {
    if (!isAdmin || !id) return;
    let cancelled = false;
    async function loadOutcomes() {
      const emptyAcc: Record<LeadStatus, number> = {
        NEW: 0,
        VOICEMAIL: 0,
        MEETING_BOOKED: 0,
        NOT_INTERESTED: 0,
        UNQUALIFIED: 0,
        NOT_HOME: 0,
        CALLBACK_SCHEDULED: 0,
      };
      const res = await fetch(
        `/api/leads?campaignId=${encodeURIComponent(id)}&outcomeStats=1`,
      );
      if (!res.ok) {
        if (!cancelled) {
          setOutcomeStats({
            byStatus: emptyAcc,
            protectedCount: 0,
            newCountWhenExcludingProtected: 0,
          });
        }
        return;
      }
      const rows: { status: string; customFields: string }[] = await res.json();
      const acc: Record<LeadStatus, number> = { ...emptyAcc };
      let protectedCount = 0;
      let newCountWhenExcludingProtected = 0;
      for (const r of rows) {
        if (getReklamebeskyttetNormalized(r.customFields) === "ja") {
          protectedCount += 1;
        }
        const st = String(r.status ?? "").trim().toUpperCase();
        if (isLeadStatus(st)) acc[st] += 1;
        if (
          st === "NEW" &&
          leadIncludedForCampaignProtectedSetting(r.customFields, false)
        ) {
          newCountWhenExcludingProtected += 1;
        }
      }
      if (!cancelled) {
        setOutcomeStats({ byStatus: acc, protectedCount, newCountWhenExcludingProtected });
      }
    }
    void loadOutcomes();
    return () => {
      cancelled = true;
    };
  }, [id, isAdmin]);

  function addRow(g: FieldGroupKey) {
    setExt((prev) => ({
      ...prev,
      [g]: [...prev[g], { key: "", label: "", draftId: uid() }],
    }));
  }

  function updateRow(g: FieldGroupKey, draftId: string, patch: Partial<Pick<Row, "label" | "key">>) {
    setExt((prev) => ({
      ...prev,
      [g]: prev[g].map((r) => (r.draftId === draftId ? { ...r, ...patch } : r)),
    }));
  }

  function removeRow(g: FieldGroupKey, draftId: string) {
    setExt((prev) => ({
      ...prev,
      [g]: prev[g].filter((r) => r.draftId !== draftId),
    }));
  }

  async function onExportCampaign() {
    if (exporting || !id) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const res = await fetch(`/api/campaigns/${id}/export?format=${exportFormat}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setExportMessage(typeof j.error === "string" ? j.error : "Eksport fejlede");
        return;
      }
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      let filename = `export.${exportFormat}`;
      const star = /filename\*=UTF-8''([^;]+)/i.exec(disp);
      const quoted = /filename="([^"]+)"/i.exec(disp);
      if (star?.[1]) filename = decodeURIComponent(star[1]);
      else if (quoted?.[1]) filename = quoted[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMessage("Filen er hentet.");
    } catch {
      setExportMessage("Eksport fejlede");
    } finally {
      setExporting(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setError(null);

    const used = new Set<string>();
    const extensions: Partial<Record<FieldGroupKey, CampaignExtraField[]>> = {};

    for (const g of FIELD_GROUPS) {
      const list: CampaignExtraField[] = [];
      for (const row of ext[g]) {
        const label = row.label.trim();
        if (!label) {
          setError("Alle ekstra felter skal have et mærkat (label)");
          return;
        }
        const manual = row.key.trim();
        let key: string;
        if (manual && !used.has(manual)) {
          key = manual;
          used.add(key);
        } else {
          key = slugifyKey(label, used);
        }
        list.push({ key, label });
      }
      if (list.length) extensions[g] = list;
    }

    setSaving(true);
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        fieldConfig: serializeFieldConfig({ extensions }),
        includeProtectedBusinesses,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke gemme");
      return;
    }
    router.push("/kampagner");
    router.refresh();
  }

  if (status === "loading") {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (!isAdmin) {
    return null;
  }

  if (!id) {
    return <p className="text-stone-500">Indlæser…</p>;
  }

  if (loading) {
    return <p className="text-stone-500">Henter…</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <Link href="/kampagner" className="text-sm text-stone-500 hover:text-stone-800">
          ← Tilbage til kampagner
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">Kampagne-layout</h1>
        <p className="mt-1 text-sm text-stone-600">
          Standardfelterne (virksomhed, telefon, CVR, adresse, branche) er altid synlige. Tilføj ekstra felter
          under det område, de hører til — fx &quot;Stifter navn&quot; under virksomhedsnavn eller &quot;Direktør
          telefon&quot; under telefon.
        </p>
      </div>

      {campaignMeta && (
        <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900">Slet kampagne</h2>
          <p className="mt-1 text-xs text-stone-500">
            Fjerner kun selve kampagnen. Leads bevares uden tilknytning til denne kampagne.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
            <CampaignDeleteFlow
              campaignId={id}
              campaignName={name.trim() || campaignMeta.name}
              deletable={canDeleteCampaign(campaignMeta)}
              protectedExplanation={PROTECTED_CAMPAIGN_DELETE_MESSAGE}
              onDeleted={() => {
                router.push("/kampagner");
                router.refresh();
              }}
            />
          </div>
        </section>
      )}

      {outcomeStats && (
        <section className="rounded-lg border border-stone-200 bg-stone-50/80 p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Udfald på kampagne (alle leads)
          </h2>
          <p className="mt-1 text-xs text-stone-600">
            Øvrige udfald er alle leads i kampagnen. «Ny» følger «Medtag reklamebeskyttede»:{' '}
            <span className="font-medium text-stone-800">Ja</span> = alle med status Ny;{' '}
            <span className="font-medium text-stone-800">Nej</span> = kun Ny som ikke er markeret
            reklamebeskyttet (ja), samme logik som opkaldskøen.
          </p>
          <p className="mt-2 text-xs text-stone-600">
            <span className="font-medium text-stone-800">Reklamebeskyttet (ja):</span>{' '}
            <span className="tabular-nums">{outcomeStats.protectedCount}</span> leads
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LEAD_STATUS_STATS_ORDER.map((s) => {
              const n =
                s === "NEW"
                  ? includeProtectedBusinesses
                    ? outcomeStats.byStatus.NEW
                    : outcomeStats.newCountWhenExcludingProtected
                  : outcomeStats.byStatus[s];
              return (
                <span
                  key={s}
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${LEAD_STATUS_COUNT_BADGE_CLASS[s]}`}
                >
                  {LEAD_STATUS_LABELS[s]}: {n}
                </span>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-900">Leads i denne kampagne</h2>
            <p className="mt-1 text-xs text-stone-500">
              Vælg leads og slet dem efter behov. Standard-sortering er uden udfald først, derefter ældste udfald først.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/import?campaignId=${encodeURIComponent(id)}`}
              className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-100"
            >
              Importer leads
            </Link>
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <span className="sr-only">Filformat</span>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as "csv" | "xlsx")}
                disabled={exporting}
                className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
              >
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (.csv)</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void onExportCampaign()}
              disabled={exporting}
              className="rounded-md bg-stone-800 px-3 py-2 text-xs font-medium text-white hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Eksporterer…" : "Eksporter kampagne"}
            </button>
          </div>
        </div>
        {exportMessage && (
          <p className="mt-2 text-xs text-stone-600" role="status">
            {exportMessage}
          </p>
        )}
        <div className="mt-4">
          <LeadsBulkPanel
            campaignId={id}
            showSearchField
            leadDetailSearchSuffix={`?fromCampaign=${encodeURIComponent(id)}`}
          />
        </div>
      </section>

      <form onSubmit={onSave} className="space-y-8">
        <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium text-stone-700">Kampagnenavn</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full max-w-md rounded-md border border-stone-200 px-3 py-2 text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
          />
          <div className="mt-8 max-w-md border-t border-stone-100 pt-6">
            <CampaignProtectedSwitch
              includeProtected={includeProtectedBusinesses}
              onChange={setIncludeProtectedBusinesses}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-6">
          {KAMPAGNE_FORM_GROUPS.map((g) => {
            if (g === "address") {
              return (
                <section
                  key="address-block"
                  className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
                >
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-stone-900">Adresse</h2>
                    <p className="mt-1 text-xs text-stone-500">
                      Vej, postnr. og by vises samlet på leadet. Tilføj ekstra felter under det område, de hører til.
                    </p>
                  </div>
                  <div className="space-y-6">
                    {ADDRESS_SUB_GROUPS.map((sub, i) => (
                      <div key={sub} className={i > 0 ? "border-t border-stone-100 pt-6" : ""}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                              {FIELD_GROUP_LABELS[sub]}
                            </h3>
                            <p className="mt-1 text-xs text-stone-500">
                              Standardfeltet vises altid på leadet. Tilføj eventuelle ekstra felter herunder.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addRow(sub)}
                            className="shrink-0 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
                          >
                            Tilføj felt under {FIELD_GROUP_LABELS[sub].toLowerCase()}
                          </button>
                        </div>

                        {ext[sub].length > 0 && (
                          <ul className="mt-4 space-y-3">
                            {ext[sub].map((row) => (
                              <li
                                key={row.draftId}
                                className="flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-3"
                              >
                                <div className="min-w-[180px] flex-1">
                                  <label className="text-xs font-medium text-stone-600">Mærkat</label>
                                  <input
                                    value={row.label}
                                    onChange={(e) =>
                                      updateRow(sub, row.draftId, { label: e.target.value })
                                    }
                                    placeholder="Fx Stifter navn"
                                    className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                                  />
                                </div>
                                <div className="w-40">
                                  <label className="text-xs font-medium text-stone-600">Nøgle (valgfri)</label>
                                  <input
                                    value={row.key}
                                    onChange={(e) =>
                                      updateRow(sub, row.draftId, { key: e.target.value })
                                    }
                                    placeholder="Auto"
                                    className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeRow(sub, row.draftId)}
                                  className="rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Fjern
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              );
            }

            return (
              <section key={g} className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-900">{FIELD_GROUP_LABELS[g]}</h2>
                    <p className="mt-1 text-xs text-stone-500">
                      Standardfeltet vises altid på leadet. Tilføj eventuelle ekstra felter herunder.
                      {g === "cvr" ? (
                        <>
                          {" "}
                          <span className="text-stone-600">
                            <strong className="font-medium text-stone-700">Reklamebeskyttet</strong> og{" "}
                            <strong className="font-medium text-stone-700">Virksomhedsform</strong> følger
                            automatisk med under CVR i alle kampagner.
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => addRow(g)}
                    className="shrink-0 rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-800 hover:bg-stone-100"
                  >
                    Tilføj felt under {FIELD_GROUP_LABELS[g].toLowerCase()}
                  </button>
                </div>

                {ext[g].length > 0 && (
                  <ul className="mt-4 space-y-3">
                    {ext[g].map((row) => {
                      const fixedCvr = g === "cvr" && isFixedCvrExtensionKey(row.key);
                      const fixedPerson = g === "companyName" && isFixedPersonExtensionKey(row.key);
                      const fixedField = fixedCvr || fixedPerson;
                      return (
                        <li key={row.draftId} className="flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-3">
                          <div className="min-w-[180px] flex-1">
                            <label className="text-xs font-medium text-stone-600">Mærkat</label>
                            <input
                              value={row.label}
                              onChange={(e) => updateRow(g, row.draftId, { label: e.target.value })}
                              placeholder="Fx Stifter navn"
                              className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                            />
                          </div>
                          <div className="w-40">
                            <label className="text-xs font-medium text-stone-600">Nøgle (valgfri)</label>
                            <input
                              value={row.key}
                              onChange={(e) => updateRow(g, row.draftId, { key: e.target.value })}
                              placeholder="Auto"
                              readOnly={fixedField}
                              title={fixedField ? "Standardfelt — nøgle er låst" : undefined}
                              className={`mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 font-mono text-xs text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2 ${fixedField ? "cursor-not-allowed bg-stone-100 text-stone-600" : ""}`}
                            />
                          </div>
                          {fixedField ? (
                            <span className="self-end px-2 py-2 text-xs text-stone-500">Standardfelt</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeRow(g, row.draftId)}
                              className="rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              Fjern
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
        >
          {saving ? "Gemmer…" : "Gem kampagne"}
        </button>
      </form>
    </div>
  );
}

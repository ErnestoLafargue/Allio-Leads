"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  FIXED_EMAIL_ANNONCER_FIELDS,
  parseFieldConfig,
  type FieldGroupKey,
} from "@/lib/campaign-fields";
import { CampaignImportLogsPanel } from "@/app/components/campaign-import-logs-panel";
import { STANDARD_MAPPING_OPTIONS } from "@/lib/import-mapping";
import {
  IMPORT_PATCH_FIELD_OPTIONS,
  IMPORT_PATCH_MATCH_OPTIONS,
  type ImportPatchField,
  type ImportPatchFieldCounts,
  type ImportPatchMatchField,
} from "@/lib/import-patch";

type Campaign = { id: string; name: string; fieldConfig: string };

type PreviewResponse = {
  columns: string[];
  previewRows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  overwritePreview?: {
    cvrMatches: number;
    protectedCvrs: number;
    leadsToDelete: number;
    newLeadsToImport: number;
  } | null;
};

type ImportDetailReason =
  | "duplicate_in_file"
  | "already_in_campaign"
  | "invalid_row"
  | "no_match"
  | "matched_no_update";

type ImportResult = {
  totalRows: number;
  newLeadsImported: number;
  existingAttached: number;
  overwriteMatchedCvrs?: number;
  protectedCvrsSkipped?: number;
  replacedLeadsDeleted?: number;
  skippedDuplicateInFile: number;
  skippedAlreadyInCampaign: number;
  skippedInvalid: number;
  skippedNoMatch?: number;
  matchedNoUpdate?: number;
  patchFieldCounts?: ImportPatchFieldCounts;
  patchMatchField?: ImportPatchMatchField;
  details: {
    dataRow: number;
    cvr: string;
    reason: ImportDetailReason;
    note?: string;
  }[];
};

type WorkflowMode = "import" | "enrich";

type ImportProgressEvent =
  | { type: "progress"; processedRows: number; totalRows: number; percent: number }
  | { type: "result"; result: ImportResult }
  | { type: "error"; error?: string; details?: string };

function detailReasonLabel(r: ImportDetailReason): string {
  switch (r) {
    case "duplicate_in_file":
      return "Dublet i fil";
    case "already_in_campaign":
      return "Allerede i denne kampagne";
    case "invalid_row":
      return "Ugyldig række";
    case "no_match":
      return "Ingen match";
    case "matched_no_update":
      return "Match — intet at udfylde";
    default:
      return r;
  }
}

function buildMappingSelectOptions(fieldConfigJson: string) {
  const cfg = parseFieldConfig(fieldConfigJson);
  const opts: { id: string; label: string }[] = [...STANDARD_MAPPING_OPTIONS];
  const seen = new Set<string>();
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      seen.add(f.key);
      opts.push({
        id: `custom:${f.key}`,
        label: `${f.label} (${FIELD_GROUP_LABELS[g]})`,
      });
    }
  }
  // Annoncer kan mappes uden at være slået til — import slår dem til/fra ud fra om der indsættes data.
  for (const f of FIXED_EMAIL_ANNONCER_FIELDS) {
    if (seen.has(f.key)) continue;
    opts.push({
      id: `custom:${f.key}`,
      label: `${f.label} (${FIELD_GROUP_LABELS.email})`,
    });
  }
  return opts;
}

export default function ImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignIdFromQuery = searchParams.get("campaignId");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [fieldConfigJson, setFieldConfigJson] = useState("{}");

  const [newCampaignName, setNewCampaignName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [columns, setColumns] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const [importProgressPercent, setImportProgressPercent] = useState(0);
  const [importProgressProcessedRows, setImportProgressProcessedRows] = useState(0);
  const [importProgressTotalRows, setImportProgressTotalRows] = useState(0);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [attachExistingCvrsToCampaign, setAttachExistingCvrsToCampaign] = useState(false);
  const [importDuplicateCvrs, setImportDuplicateCvrs] = useState(false);
  const [overwriteExistingCvrs, setOverwriteExistingCvrs] = useState(false);
  const [allowMissingCvr, setAllowMissingCvr] = useState(false);
  const [allowMissingCompanyName, setAllowMissingCompanyName] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("import");
  const patchMissingOnly = workflowMode === "enrich";
  const [patchAllCampaigns, setPatchAllCampaigns] = useState(true);
  const [patchMatchField, setPatchMatchField] = useState<ImportPatchMatchField>("cvr");
  const [patchFields, setPatchFields] = useState<ImportPatchField[]>(["virksomhedstype"]);
  const [overwritePreview, setOverwritePreview] = useState<PreviewResponse["overwritePreview"]>(null);
  const [showAllInCampaignLoading, setShowAllInCampaignLoading] = useState(false);
  const [showAllInCampaignError, setShowAllInCampaignError] = useState<string | null>(null);
  /** Nulstiller fil-input når import er færdig, så «forsiden» er tydelig */
  const [fileInputKey, setFileInputKey] = useState(0);
  const [importLogRefreshKey, setImportLogRefreshKey] = useState(0);

  const [addFieldColumn, setAddFieldColumn] = useState<string | null>(null);
  const [addFieldLabel, setAddFieldLabel] = useState("");
  const [addFieldGroup, setAddFieldGroup] = useState<FieldGroupKey>("companyName");
  const [addFieldLoading, setAddFieldLoading] = useState(false);
  const [addFieldError, setAddFieldError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    if (!res.ok) return;
    const data: Campaign[] = await res.json();
    setCampaigns(data);
    setCampaignId((prev) => {
      if (prev && data.some((c) => c.id === prev)) return prev;
      return data[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "ADMIN") return;
    void loadCampaigns();
  }, [status, session?.user.role, loadCampaigns]);

  useEffect(() => {
    if (!campaignIdFromQuery || campaigns.length === 0) return;
    if (campaigns.some((c) => c.id === campaignIdFromQuery)) {
      setCampaignId(campaignIdFromQuery);
    }
  }, [campaignIdFromQuery, campaigns]);

  useEffect(() => {
    if (!campaignId) {
      setFieldConfigJson("{}");
      return;
    }
    void (async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) return;
      const c = await res.json();
      setFieldConfigJson(c.fieldConfig ?? "{}");
    })();
  }, [campaignId]);

  if (status === "loading") {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (session?.user.role !== "ADMIN") {
    router.replace("/leads");
    return null;
  }

  const mappingOptions = buildMappingSelectOptions(fieldConfigJson);

  const hasRequiredMapping =
    (allowMissingCompanyName || Object.values(mapping).includes("companyName")) &&
    (allowMissingCvr || Object.values(mapping).includes("cvr"));

  const mappedTargets = new Set(Object.values(mapping));
  const patchMatchMappingOk = (() => {
    if (!patchMissingOnly) return true;
    if (patchMatchField === "cvr") return mappedTargets.has("cvr");
    if (patchMatchField === "phone") return mappedTargets.has("phone");
    if (patchMatchField === "email") return mappedTargets.has("email");
    return (
      mappedTargets.has("domain") ||
      mappedTargets.has("custom:domaene") ||
      mappedTargets.has("custom:domain") ||
      mappedTargets.has("email")
    );
  })();
  const patchFieldMappingOk = (() => {
    if (!patchMissingOnly) return true;
    if (patchFields.length === 0) return false;
    if (!patchMatchMappingOk) return false;
    for (const field of patchFields) {
      if (field === "phone" && !mappedTargets.has("phone")) return false;
      if (field === "email" && !mappedTargets.has("email")) return false;
      if (field === "domain") {
        const hasDomain =
          mappedTargets.has("domain") ||
          mappedTargets.has("custom:domaene") ||
          mappedTargets.has("custom:domain") ||
          mappedTargets.has("email");
        if (!hasDomain) return false;
      }
      if (field === "virksomhedstype" && !mappedTargets.has("custom:virksomhedstype")) return false;
      if (field === "otherCustom") {
        const hasOther = [...mappedTargets].some(
          (t) =>
            t.startsWith("custom:") &&
            t !== "custom:virksomhedstype" &&
            t !== "custom:domaene" &&
            t !== "custom:domain",
        );
        if (!hasOther) return false;
      }
    }
    return true;
  })();

  function togglePatchField(field: ImportPatchField, on: boolean) {
    setPatchFields((prev) => {
      if (on) return prev.includes(field) ? prev : [...prev, field];
      return prev.filter((f) => f !== field);
    });
  }

  function setEnrichMode(on: boolean) {
    if (on) {
      setWorkflowMode("enrich");
      setPatchAllCampaigns(true);
      if (patchFields.length === 0) setPatchFields(["virksomhedstype"]);
    } else {
      setWorkflowMode("import");
    }
  }

  async function onCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const name = newCampaignName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCreateError(j.error ?? "Kunne ikke oprette kampagne");
      return;
    }
    const c = await res.json();
    setNewCampaignName("");
    await loadCampaigns();
    setCampaignId(c.id);
    setFieldConfigJson(c.fieldConfig ?? "{}");
  }

  function onFileChange(f: File | null) {
    setFile(f);
    setStep(1);
    setColumns([]);
    setPreviewRows([]);
    setMapping({});
    setResult(null);
    setError(null);
    setOverwritePreview(null);
  }

  async function onAnalyze(useCurrentMapping = false) {
    if (!file || !campaignId) return;
    setError(null);
    setResult(null);
    setLoadingPreview(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("campaignId", campaignId);
    if (useCurrentMapping) fd.append("mapping", JSON.stringify(mapping));
    fd.append("overwriteExistingCvrs", overwriteExistingCvrs ? "1" : "0");
    const res = await fetch("/api/import/preview", { method: "POST", body: fd });
    setLoadingPreview(false);
    if (!res.ok) {
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string; details?: string };
        setError([j.error, j.details].filter(Boolean).join(": ") || "Kunne ikke læse filen");
      } catch {
        setError(
          text.trim()
            ? `Kunne ikke læse filen (${res.status}): ${text.trim().slice(0, 400)}`
            : `Kunne ikke læse filen (HTTP ${res.status})`,
        );
      }
      return;
    }
    const data: PreviewResponse = await res.json();
    setColumns(data.columns);
    setPreviewRows(data.previewRows);
    if (!useCurrentMapping) setMapping(data.suggestedMapping);
    setOverwritePreview(data.overwritePreview ?? null);
    setStep(2);
  }

  function setMap(col: string, target: string) {
    setMapping((prev) => ({ ...prev, [col]: target }));
  }

  function closeAddFieldDialog() {
    setAddFieldColumn(null);
    setAddFieldLabel("");
    setAddFieldGroup("companyName");
    setAddFieldError(null);
  }

  async function submitAddField() {
    if (!addFieldColumn || !campaignId) return;
    const label = addFieldLabel.trim();
    if (!label) {
      setAddFieldError("Skriv et navn til feltet");
      return;
    }
    setAddFieldError(null);
    setAddFieldLoading(true);
    const res = await fetch(`/api/campaigns/${campaignId}/extension-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: addFieldGroup, label }),
    });
    setAddFieldLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setAddFieldError(j.error ?? "Kunne ikke oprette felt");
      return;
    }
    const data: { key: string; fieldConfig: string } = await res.json();
    setFieldConfigJson(data.fieldConfig);
    setMap(addFieldColumn, `custom:${data.key}`);
    await loadCampaigns();
    closeAddFieldDialog();
  }

  async function onImport() {
    if (!file || !campaignId) return;
    setImportConfirmOpen(false);
    setError(null);
    setResult(null);
    setLoadingImport(true);
    setImportProgressPercent(0);
    setImportProgressProcessedRows(0);
    setImportProgressTotalRows(0);
    setShowAllInCampaignError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("campaignId", campaignId);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("attachExistingCvrsToCampaign", attachExistingCvrsToCampaign ? "1" : "0");
    fd.append("importDuplicateCvrs", importDuplicateCvrs ? "1" : "0");
    fd.append("overwriteExistingCvrs", overwriteExistingCvrs ? "1" : "0");
    fd.append("allowMissingCvr", allowMissingCvr ? "1" : "0");
    fd.append("allowMissingCompanyName", allowMissingCompanyName ? "1" : "0");
    fd.append("patchMissingOnly", patchMissingOnly ? "1" : "0");
    fd.append("patchAllCampaigns", patchAllCampaigns ? "1" : "0");
    if (patchMissingOnly) {
      fd.append("patchFields", JSON.stringify(patchFields));
      fd.append("patchMatchField", patchMatchField);
    }
    const res = await fetch("/api/import/csv", { method: "POST", body: fd });
    if (!res.ok) {
      setLoadingImport(false);
      const text = await res.text();
      try {
        const j = JSON.parse(text) as { error?: string; details?: string };
        setError([j.error, j.details].filter(Boolean).join(": ") || "Import fejlede");
      } catch {
        setError(
          text.trim()
            ? `Import fejlede (${res.status}): ${text.trim().slice(0, 400)}`
            : `Import fejlede (HTTP ${res.status})`,
        );
      }
      return;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-ndjson") || !res.body) {
      const data: ImportResult = await res.json();
      setResult(data);
      setImportLogRefreshKey((k) => k + 1);
      setLoadingImport(false);
      setStep(1);
      setColumns([]);
      setPreviewRows([]);
      setMapping({});
      setFile(null);
      setFileInputKey((k) => k + 1);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let gotResult = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let evt: ImportProgressEvent;
        try {
          evt = JSON.parse(trimmed) as ImportProgressEvent;
        } catch {
          continue;
        }
        if (evt.type === "progress") {
          setImportProgressPercent(Math.max(0, Math.min(100, evt.percent)));
          setImportProgressProcessedRows(evt.processedRows);
          setImportProgressTotalRows(evt.totalRows);
        } else if (evt.type === "result") {
          setResult(evt.result);
          setImportLogRefreshKey((k) => k + 1);
          gotResult = true;
        } else if (evt.type === "error") {
          setError([evt.error, evt.details].filter(Boolean).join(": ") || "Import fejlede");
          setLoadingImport(false);
          return;
        }
      }
    }
    if (!gotResult) {
      setError("Import blev afbrudt før resultat.");
      setLoadingImport(false);
      return;
    }
    setLoadingImport(false);
    /* Tilbage til trin 1: skjul kolonne-mapping som om man er på forsiden */
    setStep(1);
    setColumns([]);
    setPreviewRows([]);
    setMapping({});
    setFile(null);
    setFileInputKey((k) => k + 1);
  }

  async function showAllLeadsInCampaign() {
    if (!campaignId) return;
    setShowAllInCampaignError(null);
    setShowAllInCampaignLoading(true);
    try {
      const patch = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeProtectedBusinesses: true }),
      });
      if (!patch.ok) {
        const j = await patch.json().catch(() => ({}));
        throw new Error(typeof j.error === "string" ? j.error : "Kunne ikke opdatere kampagnen");
      }
      router.push(`/kampagner/${encodeURIComponent(campaignId)}`);
    } catch (e) {
      setShowAllInCampaignError(e instanceof Error ? e.message : "Kunne ikke opdatere kampagnen");
      setShowAllInCampaignLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Opret &amp; Import</h1>
        <p className="mt-1 text-sm text-stone-600">
          Opret nye kampagner og importer leads fra CSV eller Excel. Efter upload analyseres kolonnerne — du mapper dem
          til jeres felter før import.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-900">Ny kampagne</h2>
        <p className="mt-1 text-xs text-stone-500">Her oprettes kampagner. Eksisterende kampagner vælges under fanen Kampagner.</p>
        <form onSubmit={onCreateCampaign} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="newCamp" className="text-sm font-medium text-stone-700">
              Navn
            </label>
            <input
              id="newCamp"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="Fx Q1 2026"
              className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !newCampaignName.trim()}
            className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-50"
          >
            {creating ? "Opretter…" : "Opret kampagne"}
          </button>
        </form>
        {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-stone-900">Import eller berigelse</h2>
        <p className="mt-1 text-xs text-stone-500">
          Trin 1: Vælg kampagne og fil. Trin 2: Map kolonner og vælg enten <strong>Importer nye leads</strong>{" "}
          eller <strong>Berig eksisterende leads</strong>. Ved berigelse matches på CVR, telefon, e-mail eller
          domæne, og kun tomme felter udfyldes — eksisterende leads springes ikke over som dubletter.
        </p>

        {result && (
          <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-medium">
              {result.patchFieldCounts ? "Berigelse gennemført" : "Import gennemført"}
            </p>
            <ul className="list-inside list-disc space-y-1 tabular-nums">
              <li>{result.totalRows} rækker i filen (efter tomme rækker er fjernet)</li>
              {result.patchFieldCounts ? (
                <>
                  <li>
                    Match på{" "}
                    {IMPORT_PATCH_MATCH_OPTIONS.find((o) => o.id === result.patchMatchField)?.label ??
                      "CVR"}
                  </li>
                  <li>{result.existingAttached} leads beriget (tomme felter udfyldt)</li>
                  <li>{result.matchedNoUpdate ?? 0} matches uden ændring (allerede udfyldt)</li>
                  <li>{result.skippedNoMatch ?? 0} rækker uden match</li>
                  <li>{result.skippedDuplicateInFile} dubletter i filen</li>
                  <li>{result.skippedInvalid} ugyldige rækker (manglende match-nøgle)</li>
                  {IMPORT_PATCH_FIELD_OPTIONS.filter(
                    (o) => (result.patchFieldCounts?.[o.id] ?? 0) > 0,
                  ).map((o) => (
                    <li key={o.id}>
                      {o.label}: {result.patchFieldCounts?.[o.id] ?? 0} leads
                    </li>
                  ))}
                </>
              ) : (
                <>
                  <li>{result.newLeadsImported} nye leads oprettet</li>
                  {overwriteExistingCvrs && (
                    <>
                      <li>{result.overwriteMatchedCvrs ?? 0} CVR-matches behandlet til overskrivning</li>
                      <li>{result.protectedCvrsSkipped ?? 0} beskyttede CVR&apos;er sprunget over</li>
                      <li>{result.replacedLeadsDeleted ?? 0} eksisterende leads slettet/erstattet</li>
                    </>
                  )}
                  <li>
                    {result.existingAttached} eksisterende leads knyttet til kampagne (flyttet fra anden
                    kampagne hvis nødvendigt)
                  </li>
                  <li>
                    {result.skippedDuplicateInFile + result.skippedAlreadyInCampaign} dubletter sprunget
                    over
                    {result.skippedDuplicateInFile > 0 || result.skippedAlreadyInCampaign > 0
                      ? ` (${result.skippedDuplicateInFile} i filen, ${result.skippedAlreadyInCampaign} allerede i kampagne)`
                      : ""}
                  </li>
                  <li>
                    {result.skippedInvalid} ugyldige rækker sprunget over (manglende CVR, forkert format
                    eller manglende navn for nye)
                  </li>
                </>
              )}
            </ul>
            {result.details.length > 0 && (
              <details className="rounded-md border border-emerald-200/80 bg-white/90">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-emerald-950">
                  Vis sprungen rækker (CVR og årsag)
                </summary>
                <div className="max-h-60 overflow-auto border-t border-emerald-100 px-3 py-2 text-xs text-stone-800">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-white text-stone-500">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Række</th>
                        <th className="py-1 pr-2 font-medium">CVR</th>
                        <th className="py-1 font-medium">Årsag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {result.details.map((d, i) => (
                        <tr key={`${d.dataRow}-${d.reason}-${i}`}>
                          <td className="py-1 pr-2 tabular-nums">{d.dataRow}</td>
                          <td className="py-1 pr-2 font-mono">{d.cvr}</td>
                          <td className="py-1">
                            {detailReasonLabel(d.reason)}
                            {d.note ? <span className="block text-stone-500">{d.note}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.skippedDuplicateInFile +
                    result.skippedAlreadyInCampaign +
                    result.skippedInvalid >
                    result.details.length && (
                    <p className="mt-2 text-stone-500">
                      Listen viser højst {result.details.length} rækker; flere blev sprunget over uden linje-detalje.
                    </p>
                  )}
                </div>
              </details>
            )}
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-sm font-medium text-emerald-900 underline-offset-2 hover:underline"
            >
              Skjul denne besked
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void showAllLeadsInCampaign()}
                disabled={showAllInCampaignLoading || !campaignId}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
              >
                {showAllInCampaignLoading
                  ? "Aktiverer vis alle…"
                  : "Vis alle i kampagnen (inkl. reklamebeskyttede)"}
              </button>
              <p className="text-xs text-emerald-900/80">
                Slår automatisk «Medtag reklamebeskyttede» til på kampagnen.
              </p>
            </div>
            {showAllInCampaignError && (
              <p className="text-sm text-red-700">{showAllInCampaignError}</p>
            )}
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="campImp" className="block text-sm font-medium text-stone-700">
              Kampagne
            </label>
            <select
              id="campImp"
              required
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                if (step === 2) {
                  setStep(1);
                  setColumns([]);
                  setPreviewRows([]);
                  setMapping({});
                  setResult(null);
                }
              }}
              className="mt-1 w-full max-w-md rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
            >
              {campaigns.length === 0 ? (
                <option value="">Opret en kampagne ovenfor</option>
              ) : (
                campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          {campaignId && (
            <CampaignImportLogsPanel campaignId={campaignId} refreshKey={importLogRefreshKey} />
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700">Fil (.csv, .xlsx, .xls)</label>
            <input
              key={fileInputKey}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-stone-600 file:mr-4 file:rounded-md file:border-0 file:bg-stone-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-stone-800"
            />
          </div>

          {step === 1 && (
            <button
              type="button"
              disabled={loadingPreview || !file || !campaignId}
              onClick={() => void onAnalyze()}
              className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
            >
              {loadingPreview ? "Analyserer…" : "Analyser fil og fortsæt"}
            </button>
          )}

          {step === 2 && (
            <div className="space-y-6 border-t border-stone-100 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-stone-800">Trin 2 — Knyt kolonner til felter</p>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                  className="text-sm text-stone-600 hover:text-stone-900"
                >
                  ← Skift fil
                </button>
              </div>

              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="text-sm font-medium text-stone-800">Hvad vil du gøre?</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-stone-800">
                    <input
                      type="radio"
                      name="workflowMode"
                      checked={workflowMode === "import"}
                      onChange={() => setEnrichMode(false)}
                      className="h-4 w-4 border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    Importer nye leads
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-stone-800">
                    <input
                      type="radio"
                      name="workflowMode"
                      checked={workflowMode === "enrich"}
                      onChange={() => setEnrichMode(true)}
                      className="h-4 w-4 border-stone-300 text-amber-700 focus:ring-amber-400"
                    />
                    Berig eksisterende leads
                  </label>
                </div>
                <p className="mt-2 text-xs text-stone-600">
                  {workflowMode === "enrich"
                    ? "Finder leads der allerede findes (via CVR, telefon, e-mail eller domæne) og udfylder kun de tomme felter du vælger. Opretter ikke nye leads og springer dem ikke over som dubletter."
                    : "Opretter nye leads. Rækker med CVR der allerede findes springes over som standard."}
                </p>
              </div>

              {!patchMissingOnly && !hasRequiredMapping && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Map mindst én kolonne
                  {!allowMissingCompanyName && (
                    <>
                      {" "}
                      til <strong>Virksomhedsnavn</strong>
                    </>
                  )}
                  {!allowMissingCvr && (
                    <>
                      {!allowMissingCompanyName ? " og" : " til"} én til <strong>CVR-nummer</strong>.
                    </>
                  )}
                  {allowMissingCompanyName
                    ? " Uden virksomhedsnavn kan rækken importeres."
                    : " Uden virksomhedsnavn kan rækken ikke importeres."}
                  {allowMissingCvr ? " Uden CVR kan rækken importeres." : " Uden CVR kan rækken ikke importeres."}
                </p>
              )}

              <div className="overflow-x-auto rounded-lg border border-stone-200">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="bg-stone-50 text-stone-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Kolonne i fil</th>
                      <th className="px-3 py-2 font-medium">Map til</th>
                      <th className="px-3 py-2 font-medium">Eksempel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {columns.map((col) => {
                      const sample = previewRows
                        .map((r) => r[col])
                        .find((v) => v != null && String(v).trim()) as string | undefined;
                      const mapVal = mapping[col] ?? "skip";
                      const isSkip = mapVal === "skip";
                      return (
                        <tr key={col}>
                          <td className="px-3 py-2 font-mono text-xs text-stone-800">{col}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {isSkip ? (
                                <button
                                  type="button"
                                  title="Opret nyt felt på kampagnen og knyt denne kolonne"
                                  onClick={() => {
                                    setAddFieldColumn(col);
                                    setAddFieldLabel("");
                                    setAddFieldGroup("companyName");
                                    setAddFieldError(null);
                                  }}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-white text-lg font-light leading-none text-stone-600 shadow-sm hover:border-stone-400 hover:bg-stone-50 hover:text-stone-900"
                                >
                                  +
                                </button>
                              ) : (
                                <span className="inline-block w-8 shrink-0" aria-hidden />
                              )}
                              <select
                                value={mapVal}
                                onChange={(e) => setMap(col, e.target.value)}
                                className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                              >
                                {mappingOptions.map((o) => (
                                  <option key={`${col}-${o.id}`} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                          <td className="max-w-xs truncate px-3 py-2 text-stone-600" title={sample ?? ""}>
                            {sample ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {previewRows.length > 0 && (
                <details className="text-sm text-stone-600">
                  <summary className="cursor-pointer font-medium text-stone-800">Forhåndsvis rækker</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-stone-50 p-3 text-xs">
                    {JSON.stringify(previewRows, null, 2)}
                  </pre>
                </details>
              )}

              {workflowMode === "import" ? (
                <>
                  <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={attachExistingCvrsToCampaign}
                      onChange={(e) => setAttachExistingCvrsToCampaign(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span>
                      Tilknyt eksisterende CVR-numre til kampagne
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Flytter leads med matchende CVR fra andre kampagner til den valgte kampagne
                        (opdaterer ikke data fra filen). Leads med udfald Ikke interesseret eller
                        Ukvalificeret tilknyttes ikke.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={importDuplicateCvrs}
                      onChange={(e) => setImportDuplicateCvrs(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span>
                      Medtag allerede eksisterende CVR-numre
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Importerer rækken som et nyt lead, selv om CVR allerede findes — også i samme
                        kampagne. Flytter ikke leads fra andre kampagner (brug «Tilknyt» til det).
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={overwriteExistingCvrs}
                      onChange={(e) => setOverwriteExistingCvrs(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span>
                      Overskriv eksisterende CVR
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Erstatter eksisterende leads med samme CVR. Hvis et lead har aktivitet eller
                        noter, bliver CVR&apos;en sprunget over.
                      </span>
                    </span>
                  </label>
                  {overwriteExistingCvrs && overwritePreview && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>{overwritePreview.cvrMatches} CVR-matches fundet i kampagnen</p>
                      <p>{overwritePreview.protectedCvrs} CVR&apos;er er beskyttet og bliver ikke overskrevet</p>
                      <p>{overwritePreview.leadsToDelete} leads vil blive erstattet</p>
                      <p>{overwritePreview.newLeadsToImport} nye leads forventes importeret via overskrivning</p>
                    </div>
                  )}
                  {overwriteExistingCvrs && (
                    <button
                      type="button"
                      disabled={loadingPreview || !file || !campaignId}
                      onClick={() => void onAnalyze(true)}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                    >
                      {loadingPreview ? "Opdaterer preview…" : "Opdater overskriv-preview"}
                    </button>
                  )}

                  <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={allowMissingCompanyName}
                      onChange={(e) => setAllowMissingCompanyName(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span>
                      Medtag uden virksomhedsnavn
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Når slået til er virksomhedsnavn ikke påkrævet. Rækker uden virksomhedsnavn
                        importeres med en standardtekst.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={allowMissingCvr}
                      onChange={(e) => setAllowMissingCvr(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                    />
                    <span>
                      Importer leads uden CVR-nummer
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Når slået til er CVR ikke påkrævet. Rækker uden CVR importeres som nye leads og
                        kan ikke matches mod eksisterende via CVR.
                      </span>
                    </span>
                  </label>
                </>
              ) : (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-3">
                  <label className="block text-sm font-medium text-stone-800">
                    Match eksisterende leads på
                    <select
                      value={patchMatchField}
                      onChange={(e) => setPatchMatchField(e.target.value as ImportPatchMatchField)}
                      className="mt-1 w-full max-w-sm rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                    >
                      {IMPORT_PATCH_MATCH_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-stone-600">
                    Filens match-værdi bruges til at finde leads der allerede findes. De springes ikke
                    over — de beriges.
                  </p>
                  <p className="text-sm font-medium text-stone-800">Hvilke felter skal beriges?</p>
                  <div className="space-y-2">
                    {IMPORT_PATCH_FIELD_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className="flex items-center gap-2 text-sm text-stone-800"
                      >
                        <input
                          type="checkbox"
                          checked={patchFields.includes(option.id)}
                          onChange={(e) => togglePatchField(option.id, e.target.checked)}
                          className="h-4 w-4 rounded border-stone-300 text-amber-700 focus:ring-amber-400"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {!patchFieldMappingOk ? (
                    <p className="text-xs text-amber-900">
                      Map kolonnen til match-nøglen (
                      {IMPORT_PATCH_MATCH_OPTIONS.find((o) => o.id === patchMatchField)?.label}) og til
                      hvert valgt berigelsesfelt.
                    </p>
                  ) : null}
                  <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-stone-800">
                    <input
                      type="checkbox"
                      checked={patchAllCampaigns}
                      onChange={(e) => setPatchAllCampaigns(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-amber-700 focus:ring-amber-400"
                    />
                    <span>
                      Berig leads i alle kampagner
                      <span className="mt-0.5 block text-xs text-stone-600">
                        Matcher på tværs af hele systemet i stedet for kun den valgte kampagne.
                      </span>
                    </span>
                  </label>
                </div>
              )}

              <button
                type="button"
                disabled={
                  loadingImport ||
                  (!patchMissingOnly && !hasRequiredMapping) ||
                  (patchMissingOnly && (!patchFieldMappingOk || patchFields.length === 0))
                }
                onClick={() => setImportConfirmOpen(true)}
                className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
              >
                {loadingImport
                  ? patchMissingOnly
                    ? "Beriger…"
                    : "Importerer…"
                  : patchMissingOnly
                    ? "Berig leads"
                    : "Importer leads"}
              </button>
              {loadingImport && (
                <div className="w-full max-w-xl rounded-md border border-stone-200 bg-stone-50 p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-stone-700">
                    <span>
                      {importProgressTotalRows > 0
                        ? `Behandler ${importProgressProcessedRows} ud af ${importProgressTotalRows} leads`
                        : "Starter import…"}
                    </span>
                    <span className="font-semibold tabular-nums">{importProgressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className="h-full rounded-full bg-stone-800 transition-[width] duration-200"
                      style={{ width: `${importProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {importConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-confirm-title"
          onClick={() => !loadingImport && setImportConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="import-confirm-title" className="text-base font-semibold text-stone-900">
              {patchMissingOnly ? "Bekræft berigelse" : "Bekræft import"}
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              {patchMissingOnly ? (
                <>
                  Berigelse: matcher eksisterende leads på{" "}
                  {IMPORT_PATCH_MATCH_OPTIONS.find((o) => o.id === patchMatchField)?.label ?? "CVR"}
                  {patchAllCampaigns ? " i hele systemet" : " i den valgte kampagne"} og udfylder kun
                  tomme felter blandt:{" "}
                  {IMPORT_PATCH_FIELD_OPTIONS.filter((o) => patchFields.includes(o.id))
                    .map((o) => o.label)
                    .join(", ") || "—"}
                  . Status, noter og øvrige data bevares. Nye leads oprettes ikke. Rækker uden match
                  markeres som «Ingen match» — de springes ikke over som dubletter.{" "}
                </>
              ) : (
                <>
                  Leads med samme CVR (8 cifre) springes over som standard.{" "}
                  {attachExistingCvrsToCampaign
                    ? "Leads med matchende CVR flyttes fra andre kampagner til denne kampagne. "
                    : ""}
                  {importDuplicateCvrs
                    ? "Rækker med CVR der allerede findes importeres også som nye leads (dublet-CVR tilladt). "
                    : ""}
                  {overwriteExistingCvrs
                    ? "Ved overskrivning slettes kun leads uden noter og uden beskyttede udfald; beskyttede CVR'er springes over."
                    : ""}{" "}
                  Leads med udfald Ikke interesseret eller Ukvalificeret springes altid over. Dubletter i
                  filen springes over.{" "}
                  {allowMissingCvr
                    ? "Leads uden CVR importeres som nye leads."
                    : "Leads uden CVR springes over."}{" "}
                  {allowMissingCompanyName
                    ? "Leads uden virksomhedsnavn importeres med standardnavn."
                    : "Leads uden virksomhedsnavn springes over."}{" "}
                </>
              )}
              {patchMissingOnly ? "Bekræfter berigelse" : "Bekræfter import"} til{" "}
              <strong className="text-stone-800">{campaigns.find((c) => c.id === campaignId)?.name ?? "—"}</strong>
              {patchMissingOnly && patchAllCampaigns ? " (alle kampagner)" : ""}?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={loadingImport}
                onClick={() => setImportConfirmOpen(false)}
                className="rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Nej
              </button>
              <button
                type="button"
                disabled={loadingImport}
                onClick={() => void onImport()}
                className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
              >
                {loadingImport
                  ? patchMissingOnly
                    ? "Beriger…"
                    : "Importerer…"
                  : patchMissingOnly
                    ? "Ja, berig"
                    : "Ja, importer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {addFieldColumn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-field-title"
          onClick={() => !addFieldLoading && closeAddFieldDialog()}
        >
          <div
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="add-field-title" className="text-base font-semibold text-stone-900">
              Nyt felt på kampagnen
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Kolonnen <span className="font-mono text-stone-800">{addFieldColumn}</span> knyttes til et nyt felt under den
              valgte gruppe. Feltet gemmes på kampagnen og kan bruges på alle leads i denne kampagne.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="addFieldLabel" className="text-sm font-medium text-stone-700">
                  Navn på felt
                </label>
                <input
                  id="addFieldLabel"
                  value={addFieldLabel}
                  onChange={(e) => setAddFieldLabel(e.target.value)}
                  placeholder="Fx Stifter navn"
                  className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                />
              </div>
              <div>
                <label htmlFor="addFieldGroup" className="text-sm font-medium text-stone-700">
                  Under gruppe
                </label>
                <select
                  id="addFieldGroup"
                  value={addFieldGroup}
                  onChange={(e) => setAddFieldGroup(e.target.value as FieldGroupKey)}
                  className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                >
                  {FIELD_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {FIELD_GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {addFieldError && <p className="mt-3 text-sm text-red-600">{addFieldError}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={addFieldLoading}
                onClick={closeAddFieldDialog}
                className="rounded-md border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="button"
                disabled={addFieldLoading}
                onClick={() => void submitAddField()}
                className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
              >
                {addFieldLoading ? "Opretter…" : "Opret og knyt kolonne"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

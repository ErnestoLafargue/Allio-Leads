"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  parseFieldConfig,
  type FieldGroupKey,
} from "@/lib/campaign-fields";
import { STANDARD_MAPPING_OPTIONS } from "@/lib/import-mapping";

type Campaign = { id: string; name: string; fieldConfig: string };

type PreviewResponse = {
  columns: string[];
  previewRows: Record<string, string>[];
  suggestedMapping: Record<string, string>;
};

type ImportDetailReason = "duplicate_in_file" | "already_in_campaign" | "invalid_row";

type ImportResult = {
  totalRows: number;
  newLeadsImported: number;
  existingAttached: number;
  skippedDuplicateInFile: number;
  skippedAlreadyInCampaign: number;
  skippedInvalid: number;
  details: {
    dataRow: number;
    cvr: string;
    reason: ImportDetailReason;
    note?: string;
  }[];
};

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
    default:
      return r;
  }
}

function buildMappingSelectOptions(fieldConfigJson: string) {
  const cfg = parseFieldConfig(fieldConfigJson);
  const opts: { id: string; label: string }[] = [...STANDARD_MAPPING_OPTIONS];
  for (const g of FIELD_GROUPS) {
    for (const f of cfg.extensions[g] ?? []) {
      opts.push({
        id: `custom:${f.key}`,
        label: `${f.label} (${FIELD_GROUP_LABELS[g]})`,
      });
    }
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
  const [includeExistingCvrs, setIncludeExistingCvrs] = useState(false);
  const [allowMissingCvr, setAllowMissingCvr] = useState(false);
  /** Nulstiller fil-input når import er færdig, så «forsiden» er tydelig */
  const [fileInputKey, setFileInputKey] = useState(0);

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
    Object.values(mapping).includes("companyName") &&
    (allowMissingCvr || Object.values(mapping).includes("cvr"));

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
  }

  async function onAnalyze() {
    if (!file || !campaignId) return;
    setError(null);
    setResult(null);
    setLoadingPreview(true);
    const fd = new FormData();
    fd.append("file", file);
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
    setMapping(data.suggestedMapping);
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
    const fd = new FormData();
    fd.append("file", file);
    fd.append("campaignId", campaignId);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("includeExistingCvrs", includeExistingCvrs ? "1" : "0");
    fd.append("allowMissingCvr", allowMissingCvr ? "1" : "0");
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
        <h2 className="text-sm font-semibold text-stone-900">Import af leads</h2>
        <p className="mt-1 text-xs text-stone-500">
          Trin 1: Vælg kampagne og fil. Trin 2: Map kolonner — <strong>CVR-nummer</strong> og{' '}
          <strong>Virksomhedsnavn</strong> er påkrævet som standard (CVR bruges til dubletkontrol; kun cifre/mellemrum
          normaliseres til 8 cifre). Telefon er valgfrit, og CVR kan gøres valgfrit via indstillingen nedenfor.
        </p>

        {result && (
          <div className="mt-4 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <p className="font-medium">Import gennemført</p>
            <ul className="list-inside list-disc space-y-1 tabular-nums">
              <li>{result.totalRows} rækker i filen (efter tomme rækker er fjernet)</li>
              <li>{result.newLeadsImported} nye leads oprettet</li>
              <li>{result.existingAttached} eksisterende leads knyttet til kampagne (flyttet fra anden kampagne hvis nødvendigt)</li>
              <li>
                {result.skippedDuplicateInFile + result.skippedAlreadyInCampaign} dubletter sprunget over
                {result.skippedDuplicateInFile > 0 || result.skippedAlreadyInCampaign > 0
                  ? ` (${result.skippedDuplicateInFile} i filen, ${result.skippedAlreadyInCampaign} allerede i kampagne)`
                  : ""}
              </li>
              <li>{result.skippedInvalid} ugyldige rækker sprunget over (manglende CVR, forkert format eller manglende navn for nye)</li>
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

              {!hasRequiredMapping && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Map mindst én kolonne til <strong>Virksomhedsnavn</strong>
                  {!allowMissingCvr && (
                    <>
                      {" "}
                      og én til <strong>CVR-nummer</strong>.
                    </>
                  )}
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

              <label className="flex items-start gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
                <input
                  type="checkbox"
                  checked={includeExistingCvrs}
                  onChange={(e) => setIncludeExistingCvrs(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-400"
                />
                <span>
                  Medtag allerede eksisterende CVR-numre
                  <span className="mt-0.5 block text-xs text-stone-600">
                    Slå til for at knytte eksisterende leads til den valgte kampagne. Leads med udfald Ikke interesseret
                    eller Ukvalificeret medtages stadig ikke.
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
                    Når slået til er CVR ikke påkrævet. Rækker uden CVR importeres som nye leads og kan ikke matches
                    mod eksisterende via CVR.
                  </span>
                </span>
              </label>

              <button
                type="button"
                disabled={loadingImport || !hasRequiredMapping}
                onClick={() => setImportConfirmOpen(true)}
                className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
              >
                {loadingImport ? "Importerer…" : "Importer leads"}
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
              Bekræft import
            </h3>
            <p className="mt-2 text-sm text-stone-600">
              Leads med samme CVR (8 cifre) oprettes ikke igen. {includeExistingCvrs
                ? "Eksisterende leads knyttes til kampagnen, hvis de ligger et andet sted."
                : "Eksisterende leads springes over."}{" "}
              Leads med udfald Ikke interesseret eller Ukvalificeret springes altid over. Dubletter i filen springes
              over. {allowMissingCvr ? "Leads uden CVR importeres som nye leads." : "Leads uden CVR springes over."}{" "}
              Bekræfter import til{" "}
              <strong className="text-stone-800">{campaigns.find((c) => c.id === campaignId)?.name ?? "—"}</strong>
              ?
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
                {loadingImport ? "Importerer…" : "Ja, importer"}
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

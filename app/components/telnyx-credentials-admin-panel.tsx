"use client";

import { useCallback, useEffect, useState } from "react";

type Credential = {
  id: string;
  name: string | null;
  status: string | null;
  expired: boolean | null;
  expiresAt: string | null;
  connectionId: string | null;
  tag: string | null;
  createdAt: string | null;
};

type ListResponse = {
  ok?: boolean;
  credentials?: Credential[];
  voiceApiApplicationId?: string | null;
  allioCredentialConnectionId?: string | null;
  allioCredentialConnectionName?: string | null;
  currentCredentialId?: string | null;
  currentCredentialIdHint?: string | null;
  error?: string;
  code?: string;
  telnyxStatus?: number;
};

type CreateResponse = {
  ok?: boolean;
  credential?: Credential;
  credentialConnectionId?: string;
  credentialConnectionName?: string | null;
  error?: string;
  code?: string;
  telnyxStatus?: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleString("da-DK");
  } catch {
    return iso;
  }
}

function StatusDot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`inline-block h-2 w-2 rounded-full ${
        ok ? "bg-emerald-500" : "bg-red-500"
      }`}
    />
  );
}

export function TelnyxCredentialsAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [copyOkFor, setCopyOkFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/telnyx/admin/credentials", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as ListResponse;
      if (!res.ok || !json.ok) {
        setData(json);
        setError(
          json.error ||
            (json.code ? `[${json.code}]` : `Kunne ikke hente credentials (HTTP ${res.status}).`),
        );
      } else {
        setData(json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl ved hentning.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onCreate = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/telnyx/admin/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json().catch(() => ({}))) as CreateResponse;
      if (!res.ok || !json.ok || !json.credential) {
        setError(json.error || `Kunne ikke oprette credential (HTTP ${res.status}).`);
      } else {
        setJustCreatedId(json.credential.id);
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl ved oprettelse.");
    } finally {
      setBusy(false);
    }
  }, [fetchData]);

  const copyId = useCallback(async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopyOkFor(id);
      window.setTimeout(() => setCopyOkFor(null), 1800);
    } catch {
      // ignorér
    }
  }, []);

  const currentId = data?.currentCredentialId ?? null;
  const voiceApiApplicationId = data?.voiceApiApplicationId ?? null;
  const allioCredentialConnectionId = data?.allioCredentialConnectionId ?? null;
  const creds = data?.credentials ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-stone-900">Telnyx WebRTC credentials</h2>
            <p className="text-sm text-stone-500">
              Administrer de credentials der bruges til browser-opkald via Telnyx.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchData}
              disabled={loading || busy}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
            >
              Opdater
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Opretter…" : "Opret ny credential"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
          <div>
            <span className="text-stone-500">Voice API Application (TELNYX_CONNECTION_ID):</span>{" "}
            <span className="font-mono text-stone-800">{voiceApiApplicationId ?? "–"}</span>
          </div>
          <div>
            <span className="text-stone-500">Credential Connection (til WebRTC):</span>{" "}
            <span className="font-mono text-stone-800">
              {allioCredentialConnectionId ?? "oprettes automatisk"}
            </span>
          </div>
          <div className="sm:col-span-2">
            <span className="text-stone-500">Aktiv credential i Vercel:</span>{" "}
            <span className="font-mono text-stone-800">
              {currentId ? currentId : data?.currentCredentialIdHint ?? "–"}
            </span>
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Navn / Tag</th>
              <th className="px-4 py-3 font-medium">Credential ID</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Udløber</th>
              <th className="px-4 py-3 font-medium">Voice App</th>
              <th className="px-4 py-3 font-medium" aria-label="Handlinger" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading && (
              <tr>
                <td className="px-4 py-6 text-stone-500" colSpan={6}>
                  Henter…
                </td>
              </tr>
            )}
            {!loading && creds.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-stone-500" colSpan={6}>
                  Ingen credentials fundet på kontoen. Klik "Opret ny credential" for at oprette én.
                </td>
              </tr>
            )}
            {!loading &&
              creds.map((c) => {
                const isCurrent = currentId && c.id === currentId;
                const isJustCreated = justCreatedId === c.id;
                const statusLabel = c.expired
                  ? "Expired"
                  : (c.status ?? "Ukendt");
                const isHealthy = !c.expired && (c.status ?? "").toLowerCase() !== "expired";
                return (
                  <tr
                    key={c.id}
                    className={isJustCreated ? "bg-emerald-50" : isCurrent ? "bg-stone-50" : ""}
                  >
                    <td className="px-4 py-3">
                      <div className="text-stone-900">{c.name || c.tag || "(uden navn)"}</div>
                      {isCurrent && (
                        <div className="text-xs font-medium text-emerald-700">
                          Aktuelt brugt i appen
                        </div>
                      )}
                      {isJustCreated && (
                        <div className="text-xs font-medium text-emerald-700">
                          Netop oprettet — kopiér id og opdater Vercel
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="break-all font-mono text-xs text-stone-800">{c.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot ok={isHealthy} title={statusLabel} />
                        <span>{statusLabel}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{formatDate(c.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <span className="break-all font-mono text-xs text-stone-700">
                        {c.connectionId ?? "–"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => copyId(c.id)}
                        className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-700 shadow-sm hover:bg-stone-50"
                      >
                        {copyOkFor === c.id ? "Kopieret" : "Kopiér id"}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
        <div className="font-medium text-stone-900">Sådan aktiverer du en credential</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Klik "Opret ny credential" (eller "Kopiér id" på en eksisterende sund credential).</li>
          <li>
            Åbn{" "}
            <a
              className="text-emerald-700 underline"
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Vercel → allio-leads → Settings → Environment Variables
            </a>
            .
          </li>
          <li>
            Opdater <code className="font-mono">TELNYX_TELEPHONY_CREDENTIAL_ID</code> til det
            kopierede id (kun id, uden anførselstegn eller mellemrum).
          </li>
          <li>
            Tryk <strong>Redeploy</strong> på seneste production-deployment — Vercel trækker nye
            env-vars først efter redeploy.
          </li>
          <li>Prøv at ringe igen.</li>
        </ol>
      </div>
    </div>
  );
}

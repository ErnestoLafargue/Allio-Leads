"use client";

import { useCallback, useState } from "react";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

type Props = {
  campaignId: string;
  campaignName: string;
  /** false = beskyttet systemkampagne */
  deletable: boolean;
  /** Vises som title på deaktiveret knap */
  protectedExplanation: string;
  onDeleted: () => void;
};

export function CampaignDeleteFlow({
  campaignId,
  campaignName,
  deletable,
  protectedExplanation,
  onDeleted,
}: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeAll = useCallback(() => {
    setStep(0);
    setError(null);
  }, []);

  const runDelete = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke slette kampagne.");
      return;
    }
    closeAll();
    onDeleted();
  }, [campaignId, closeAll, onDeleted]);

  return (
    <>
      {deletable ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep(1);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 shadow-sm transition hover:bg-red-100"
        >
          <TrashIcon className="h-4 w-4 shrink-0" />
          Slet kampagne
        </button>
      ) : (
        <button
          type="button"
          disabled
          title={protectedExplanation}
          className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-stone-200 bg-stone-100 px-4 py-2.5 text-sm font-medium text-stone-400"
        >
          <TrashIcon className="h-4 w-4 shrink-0 opacity-50" />
          Slet kampagne
        </button>
      )}

      {!deletable && (
        <p className="max-w-md text-xs text-stone-500">{protectedExplanation}</p>
      )}

      {step === 1 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAll();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-camp-1-title"
            className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-camp-1-title" className="text-base font-semibold text-stone-900">
              Slet kampagne?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Er du sikker på, at du vil slette denne kampagne?
              <br />
              <br />
              Denne handling kan ikke umiddelbart fortrydes, og kampagnens indhold kan gå tabt.
            </p>
            {campaignName ? (
              <p className="mt-3 rounded-md bg-stone-50 px-3 py-2 text-sm font-medium text-stone-800">
                {campaignName}
              </p>
            ) : null}
            <div className="mt-6 flex justify-between gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setError(null);
                  setStep(2);
                }}
                className="rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
              >
                Ja, slet
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={closeAll}
                className="rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
              >
                Nej, behold
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAll();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-camp-2-title"
            className="w-full max-w-md rounded-xl border-2 border-red-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="del-camp-2-title" className="text-base font-semibold text-red-950">
              Permanent sletning
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-700">
              Du er nu ved at slette kampagnen permanent.
              <br />
              <br />
              Alle tilknytninger og kampagnedata kan blive fjernet.
              <br />
              <br />
              Er du helt sikker på, at du vil fortsætte?
            </p>
            <p className="mt-3 text-xs text-stone-500">
              Leads slettes ikke fra systemet — de mister kun tilknytningen til denne kampagne.
            </p>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-between gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={closeAll}
                className="rounded-md border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
              >
                Nej, annuller
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runDelete()}
                className="rounded-md bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-60"
              >
                {busy ? "Sletter…" : "Ja, slet permanent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

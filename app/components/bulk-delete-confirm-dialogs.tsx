"use client";

import { useCallback, useState } from "react";
import {
  formatBulkDeleteSummaryMessage,
  type BulkDeleteApiSummary,
  type BulkDeleteLeadSelection,
} from "@/lib/bulk-delete-client";

export type BulkDeletePending = {
  ids: string[];
  selected: BulkDeleteLeadSelection[];
};

type Step = "confirm" | "notes";

type Props = {
  onComplete: (summary: BulkDeleteApiSummary) => void;
  onError: (message: string) => void;
};

export function useBulkDeleteConfirm({ onComplete, onError }: Props) {
  const [pending, setPending] = useState<BulkDeletePending | null>(null);
  const [step, setStep] = useState<Step>("confirm");
  const [deleting, setDeleting] = useState(false);

  const notesCount =
    pending?.selected.filter((l) => Boolean(l.notes?.trim())).length ?? 0;

  const startDelete = useCallback((next: BulkDeletePending) => {
    if (next.ids.length === 0) return;
    setPending(next);
    setStep("confirm");
  }, []);

  const cancel = useCallback(() => {
    if (deleting) return;
    setPending(null);
    setStep("confirm");
  }, [deleting]);

  const runDelete = useCallback(
    async (includeLeadsWithNotes: boolean) => {
      if (!pending || deleting) return;
      setDeleting(true);
      const res = await fetch("/api/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: pending.ids,
          includeLeadsWithNotes,
        }),
      });
      setDeleting(false);
      const j = (await res.json().catch(() => ({}))) as BulkDeleteApiSummary & {
        error?: string;
      };
      setPending(null);
      setStep("confirm");
      if (!res.ok) {
        onError(typeof j.error === "string" ? j.error : "Kunne ikke slette leads");
        return;
      }
      onComplete(j);
    },
    [pending, deleting, onComplete, onError],
  );

  const onConfirmSlet = useCallback(() => {
    if (!pending) return;
    if (notesCount > 0) {
      setStep("notes");
      return;
    }
    void runDelete(false);
  }, [pending, notesCount, runDelete]);

  const dialog =
    pending == null ? null : step === "confirm" ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-confirm-title"
      >
        <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
          <h2 id="bulk-delete-confirm-title" className="text-lg font-semibold text-stone-900">
            Slet leads
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Er du sikker på, at du vil slette {pending.ids.length} lead
            {pending.ids.length > 1 ? "s" : ""}? Dette kan ikke fortrydes.
          </p>
          <p className="mt-2 text-xs text-stone-500">
            Leads med udfald «Møde booket» eller andet end «Ny» slettes ikke.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={deleting}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Annuller
            </button>
            <button
              type="button"
              onClick={() => void onConfirmSlet()}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Sletter…" : "Slet"}
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-delete-notes-title"
      >
        <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
          <h2 id="bulk-delete-notes-title" className="text-lg font-semibold text-stone-900">
            Leads med noter
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            {notesCount} af de valgte leads har noter. Vil du også slette leads med noter?
          </p>
          <p className="mt-2 text-xs text-stone-500">
            Vælg «Nej» for kun at slette leads uden noter (stadig kun med udfald «Ny»).
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={deleting}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
            >
              Annuller
            </button>
            <button
              type="button"
              onClick={() => void runDelete(false)}
              disabled={deleting}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
            >
              Nej
            </button>
            <button
              type="button"
              onClick={() => void runDelete(true)}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deleting ? "Sletter…" : "Ja"}
            </button>
          </div>
        </div>
      </div>
    );

  return { startDelete, dialog, deleting, cancel };
}

export { formatBulkDeleteSummaryMessage };

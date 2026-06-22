"use client";

import { useCallback, useState } from "react";

type Props = {
  leadId: string;
  className?: string;
};

/** Viser Allio lead-ID (permanent nøgle til Podio/Cal) med kopier-knap. */
export function LeadIdBadge({ leadId, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(leadId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [leadId]);

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-stone-500 ${className}`.trim()}>
      <span className="font-medium text-stone-600">Lead ID</span>
      <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-800">
        {leadId}
      </code>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
      >
        {copied ? "Kopieret" : "Kopiér"}
      </button>
    </div>
  );
}

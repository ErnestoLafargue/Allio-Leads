"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignDialMode } from "@/lib/dial-mode";

type Props = {
  leadId: string;
  campaignId: string;
  phoneDisplay: string;
  dialMode: CampaignDialMode;
  /** Predictive + power (efter connect): start opkald automatisk ved nyt lead */
  autoStartCall: boolean;
};

type LineStatus = "idle" | "ringing" | "live" | "error";

export function CampaignVoipStrip({ leadId, campaignId, phoneDisplay, dialMode, autoStartCall }: Props) {
  const [lineStatus, setLineStatus] = useState<LineStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const autoKeyRef = useRef<string | null>(null);

  async function startCall() {
    if (inFlightRef.current) return;
    const raw = phoneDisplay.replace(/\s/g, "").trim();
    if (!raw) {
      setLineStatus("error");
      setDetail("Telefonnummer mangler på leadet.");
      return;
    }
    inFlightRef.current = true;
    setLineStatus("ringing");
    setDetail("Forbinder via Telnyx…");
    try {
      const res = await fetch("/api/telnyx/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          campaignId,
          toNumber: raw,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        code?: string;
      };
      if (!res.ok) {
        setLineStatus("error");
        setDetail(
          typeof j.message === "string"
            ? j.message
            : typeof j.error === "string"
              ? j.error
              : "Kunne ikke starte opkald",
        );
        return;
      }
      setLineStatus("live");
      setDetail("Forbundet (demo) — optagelse kobles på når Telnyx WebRTC er aktiv.");
    } catch {
      setLineStatus("error");
      setDetail("Netværksfejl ved opkald.");
    } finally {
      inFlightRef.current = false;
    }
  }

  function hangUp() {
    setLineStatus("idle");
    setDetail(null);
    inFlightRef.current = false;
  }

  useEffect(() => {
    const key = `${leadId}|${phoneDisplay}|${autoStartCall}`;
    if (!autoStartCall) {
      autoKeyRef.current = null;
      return;
    }
    if (autoKeyRef.current === key) return;
    autoKeyRef.current = key;
    void startCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kun ved lead / mode-skift
  }, [leadId, phoneDisplay, autoStartCall]);

  const showManualButton =
    dialMode === "CLICK_TO_CALL" || lineStatus === "error" || (!autoStartCall && lineStatus === "idle");

  return (
    <section
      className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3 shadow-sm"
      aria-label="VoIP opkald"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">Telefonnummer</p>
          <p className="truncate font-mono text-sm font-medium text-stone-900">{phoneDisplay || "—"}</p>
          {detail && (
            <p className="mt-1 text-xs text-stone-600" role="status">
              {detail}
            </p>
          )}
          <p className="mt-1 text-[11px] text-stone-500">
            Brug headset på computeren. Opkald kører via Telnyx når API + WebRTC er konfigureret.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lineStatus === "live" || lineStatus === "ringing" ? (
            <button
              type="button"
              onClick={hangUp}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50"
            >
              Læg på
            </button>
          ) : null}
          {showManualButton ? (
            <button
              type="button"
              onClick={() => void startCall()}
              disabled={lineStatus === "ringing"}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Ring op"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      {lineStatus === "ringing" ? (
        <p className="mt-2 text-xs text-emerald-800">
          Status: <strong>ringer</strong> — optagelse startes ved «svaret» når Telnyx rapporterer det.
        </p>
      ) : null}
      {lineStatus === "live" ? (
        <p className="mt-2 text-xs text-emerald-800">
          Status: <strong>forbundet</strong> — samtale kan gemmes under Aktivitet når optagelse er aktiveret.
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignDialMode } from "@/lib/dial-mode";

type Props = {
  leadId: string;
  campaignId: string;
  /** Telefon på leadet (fra server) — bruges som udgangspunkt for opkaldsfeltet ved nyt lead */
  leadPhone: string;
  dialMode: CampaignDialMode;
  /** Predictive + power (efter connect): start opkald automatisk ved nyt lead */
  autoStartCall: boolean;
};

type LineStatus = "idle" | "ringing" | "live" | "error";

function normalizeDial(s: string) {
  return s.replace(/\s/g, "").trim();
}

export function CampaignVoipStrip({ leadId, campaignId, leadPhone, dialMode, autoStartCall }: Props) {
  const [lineStatus, setLineStatus] = useState<LineStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [dialDraft, setDialDraft] = useState(() => (leadPhone || "").trim());
  const inFlightRef = useRef(false);
  const autoKeyRef = useRef<string | null>(null);
  const lastLeadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastLeadIdRef.current === leadId) return;
    lastLeadIdRef.current = leadId;
    setDialDraft((leadPhone || "").trim());
    setLineStatus("idle");
    setDetail(null);
    autoKeyRef.current = null;
    // Kun nyt lead — ikke når brugeren retter telefonfeltet på leadet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function startCall() {
    if (inFlightRef.current) return;
    const raw = normalizeDial(dialDraft);
    if (!raw) {
      setLineStatus("error");
      setDetail("Indtast et telefonnummer til opkaldet.");
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

  function onRoundButtonClick() {
    if (lineStatus === "ringing" || lineStatus === "live") {
      hangUp();
      return;
    }
    void startCall();
  }

  useEffect(() => {
    const key = `${leadId}|${normalizeDial(dialDraft)}|${autoStartCall}`;
    if (!autoStartCall) {
      autoKeyRef.current = null;
      return;
    }
    if (autoKeyRef.current === key) return;
    if (!normalizeDial(dialDraft)) return;
    autoKeyRef.current = key;
    void startCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kun ved lead / auto / nummer til autopilot
  }, [leadId, dialDraft, autoStartCall]);

  const activeCall = lineStatus === "ringing" || lineStatus === "live";

  return (
    <section
      className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3 shadow-sm"
      aria-label="VoIP opkald"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={`voip-dial-${leadId}`} className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
            Telefonnummer (opkald)
          </label>
          <input
            id={`voip-dial-${leadId}`}
            type="text"
            inputMode="tel"
            autoComplete="off"
            value={dialDraft}
            onChange={(e) => setDialDraft(e.target.value)}
            placeholder="Nummer til opkald"
            className="mt-1 w-full max-w-sm rounded-md border border-emerald-200/80 bg-white px-3 py-2 font-mono text-sm font-medium text-stone-900 shadow-sm outline-none ring-emerald-400/40 focus:ring-2"
            title="Ændrer ikke telefonfeltet på leadet — kun nummeret der ringes til."
          />
          <p className="mt-1 text-[11px] text-stone-500">
            Standard er leadets telefon. Du kan ringe til et andet nummer uden at ændre leadets telefonfelt.
          </p>
          {detail && (
            <p className="mt-2 text-xs text-stone-600" role="status">
              {detail}
            </p>
          )}
          <p className="mt-1 text-[11px] text-stone-500">
            Brug headset. Opkald kører via Telnyx når API + WebRTC er konfigureret.
          </p>
        </div>
        <div className="flex shrink-0 items-start pt-5">
          <button
            type="button"
            onClick={onRoundButtonClick}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md transition ${
              activeCall
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            }`}
            aria-label={activeCall ? "Læg på" : "Ring op"}
          >
            {activeCall ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden="true">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            )}
          </button>
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

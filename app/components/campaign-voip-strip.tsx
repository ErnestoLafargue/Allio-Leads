"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignDialMode } from "@/lib/dial-mode";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

type Props = {
  leadId: string;
  campaignId: string;
  /** Telefon på leadet (fra server) — bruges som udgangspunkt for opkaldsfeltet ved nyt lead */
  leadPhone: string;
  dialMode: CampaignDialMode;
  /** Predictive + power (efter connect): start opkald automatisk ved nyt lead */
  autoStartCall: boolean;
};

type LineStatus = "idle" | "connecting" | "ringing" | "live" | "error";

type TelnyxClient = {
  remoteElement?: string;
  connect: () => void;
  disconnect: () => void;
  newCall: (options: { destinationNumber?: string; callerNumber?: string; remoteElement?: string }) => unknown;
  on: (eventName: string, callback: (...args: unknown[]) => void) => TelnyxClient;
  off: (eventName: string, callback?: (...args: unknown[]) => void) => TelnyxClient;
};

type TelnyxCall = {
  state?: string;
  hangup?: () => Promise<void> | void;
};

function normalizeDialDraft(s: string) {
  return s.replace(/\s/g, "").trim();
}

function callStateToLineStatus(stateRaw: unknown): LineStatus | null {
  const state = String(stateRaw ?? "").toLowerCase();
  if (!state) return null;
  if (state.includes("ring") || state.includes("trying") || state.includes("requesting")) return "ringing";
  if (state.includes("active") || state.includes("early") || state.includes("answer")) return "live";
  if (state.includes("hangup") || state.includes("destroy") || state.includes("purge")) return "idle";
  return null;
}

export function CampaignVoipStrip({ leadId, campaignId, leadPhone, autoStartCall }: Props) {
  const [lineStatus, setLineStatus] = useState<LineStatus>("idle");
  const [detail, setDetail] = useState<string | null>(null);
  const [dialDraft, setDialDraft] = useState(() => (leadPhone || "").trim());
  const [webrtcReady, setWebrtcReady] = useState(false);

  const clientRef = useRef<TelnyxClient | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const callerNumberRef = useRef<string>("");
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightRef = useRef(false);
  const autoKeyRef = useRef<string | null>(null);
  const lastLeadIdRef = useRef<string | null>(null);

  const remoteAudioId = `voip-remote-audio-${leadId}`;

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

  useEffect(() => {
    return () => {
      try {
        activeCallRef.current?.hangup?.();
      } catch {
        /* no-op */
      }
      activeCallRef.current = null;
      if (clientRef.current) {
        try {
          clientRef.current.disconnect();
        } catch {
          /* no-op */
        }
      }
      clientRef.current = null;
      initPromiseRef.current = null;
    };
  }, []);

  async function ensureClientConnected() {
    if (clientRef.current) return;
    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    initPromiseRef.current = (async () => {
      const tokenRes = await fetch("/api/telnyx/webrtc/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, campaignId }),
      });
      const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
        ok?: boolean;
        loginToken?: string;
        callerNumber?: string;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!tokenRes.ok || !tokenJson.loginToken) {
        const base =
          typeof tokenJson.message === "string"
            ? tokenJson.message
            : typeof tokenJson.error === "string"
              ? tokenJson.error
              : "Kunne ikke hente WebRTC login token";
        const code = typeof tokenJson.code === "string" && tokenJson.code.trim() ? ` [${tokenJson.code}]` : "";
        throw new Error(`${base}${code}`);
      }

      callerNumberRef.current = (tokenJson.callerNumber || "").trim();

      const mod = await import("@telnyx/webrtc");
      const TelnyxRTC = mod.TelnyxRTC as new (options: { login_token?: string }) => TelnyxClient;
      const client = new TelnyxRTC({ login_token: tokenJson.loginToken });
      client.remoteElement = remoteAudioId;

      await new Promise<void>((resolve, reject) => {
        let done = false;
        const timeout = window.setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error("Timeout ved WebRTC-forbindelse."));
        }, 15000);

        const onReady = () => {
          if (done) return;
          done = true;
          window.clearTimeout(timeout);
          setWebrtcReady(true);
          setDetail(null);
          resolve();
        };

        const onError = (evt?: unknown) => {
          if (done) return;
          done = true;
          window.clearTimeout(timeout);
          const payload = evt && typeof evt === "object" ? (evt as Record<string, unknown>) : {};
          const msgRaw = payload.error ?? payload.message;
          reject(new Error(typeof msgRaw === "string" ? msgRaw : "WebRTC-forbindelse fejlede."));
        };

        const onNotification = (evt?: unknown) => {
          const payload = evt && typeof evt === "object" ? (evt as Record<string, unknown>) : {};
          const maybeCall =
            payload.call && typeof payload.call === "object" ? (payload.call as TelnyxCall) : null;
          if (!maybeCall) return;
          activeCallRef.current = maybeCall;
          const mapped = callStateToLineStatus(maybeCall.state);
          if (mapped) setLineStatus(mapped);
          if (mapped === "idle") {
            activeCallRef.current = null;
          }
        };

        client.on("telnyx.ready", onReady);
        client.on("telnyx.error", onError);
        client.on("telnyx.notification", onNotification);
        client.connect();
      });

      clientRef.current = client;
    })();

    try {
      await initPromiseRef.current;
    } finally {
      initPromiseRef.current = null;
    }
  }

  async function startCall() {
    if (inFlightRef.current) return;
    const raw = normalizeDialDraft(dialDraft);
    const toE164 = normalizePhoneToE164ForDial(raw);
    if (!toE164) {
      setLineStatus("error");
      setDetail("Indtast et gyldigt nummer (E.164 eller 8 danske cifre).");
      return;
    }

    inFlightRef.current = true;
    setLineStatus("connecting");
    setDetail("Forbinder WebRTC…");
    try {
      await ensureClientConnected();
      if (!clientRef.current) throw new Error("WebRTC-klient blev ikke initialiseret.");

      const call = clientRef.current.newCall({
        destinationNumber: toE164,
        callerNumber: callerNumberRef.current || undefined,
        remoteElement: remoteAudioId,
      }) as TelnyxCall;
      activeCallRef.current = call;
      setLineStatus("ringing");
      setDetail(null);
    } catch (err) {
      setLineStatus("error");
      setDetail(err instanceof Error ? err.message : "Kunne ikke starte WebRTC-opkald.");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function hangUp() {
    try {
      await activeCallRef.current?.hangup?.();
    } catch {
      /* no-op */
    }
    activeCallRef.current = null;
    setLineStatus("idle");
    setDetail(null);
    inFlightRef.current = false;
  }

  function onRoundButtonClick() {
    if (lineStatus === "ringing" || lineStatus === "live" || lineStatus === "connecting") {
      void hangUp();
      return;
    }
    void startCall();
  }

  useEffect(() => {
    const key = `${leadId}|${normalizeDialDraft(dialDraft)}|${autoStartCall}`;
    if (!autoStartCall) {
      autoKeyRef.current = null;
      return;
    }
    if (autoKeyRef.current === key) return;
    if (!normalizeDialDraft(dialDraft)) return;
    autoKeyRef.current = key;
    void startCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, dialDraft, autoStartCall]);

  const activeCall =
    lineStatus === "ringing" || lineStatus === "live" || lineStatus === "connecting";

  return (
    <section
      className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3 shadow-sm"
      aria-label="VoIP opkald"
    >
      <audio id={remoteAudioId} autoPlay />
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={`voip-dial-${leadId}`}
            className="text-xs font-semibold uppercase tracking-wide text-emerald-900/80"
          >
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
          />
          {webrtcReady ? (
            <p className="mt-1 text-[11px] text-emerald-800">WebRTC klar — lyd via din Mac.</p>
          ) : null}
          {detail ? (
            <p className={`mt-2 text-xs font-medium ${lineStatus === "error" ? "text-red-700" : "text-stone-700"}`} role={lineStatus === "error" ? "alert" : "status"}>
              {detail}
            </p>
          ) : null}
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
    </section>
  );
}


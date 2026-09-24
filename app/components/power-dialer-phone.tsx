"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioLevel } from "@/lib/use-audio-level";
import {
  ensureMicPermissionAndEnumerate,
  headsetSetupBlockedReason,
  labelForDeviceId,
  readStoredDeviceId,
  setAudioElementSink,
  verifyMicDevice,
  VOIP_STORED_MIC_KEY,
  VOIP_STORED_SPK_KEY,
  writeStoredDeviceId,
} from "@/lib/voip-audio-devices";

/**
 * Power Dialer-telefon: én vedvarende WebRTC-forbindelse for hele Power-sessionen (venteskærm og
 * lead-visning). Serveren ringer sælgeren op, når et menneske har svaret; telefonen svarer selv,
 * og Telnyx bridger lead og sælger. Komponenten må ikke unmountes, mens sessionen kører.
 */

export type PowerPhoneLineStatus = "idle" | "ringing" | "live";

export type PowerPhoneState = {
  webrtcReady: boolean;
  lineStatus: PowerPhoneLineStatus;
  problem: string | null;
};

type Props = {
  campaignId: string;
  /** Sessionen er aktiv — indgående forbindelser besvares automatisk. */
  enabled: boolean;
  /** Virksomhedsnavn på det forbundne lead (vises under samtale). */
  leadLabel: string | null;
  /** Lead som taletid rapporteres på (scoreboard). */
  reportLeadId: string | null;
  /** Øges af parent for at lægge det aktuelle opkald på. */
  hangupSignal: number;
  onStateChange: (state: PowerPhoneState) => void;
};

type TelnyxCall = {
  id?: string;
  state?: unknown;
  direction?: "outbound" | "inbound";
  telnyxIDs?: { telnyxCallControlId?: string; telnyxSessionId?: string; telnyxLegId?: string };
  remoteStream?: MediaStream;
  hangup?: () => Promise<void> | void;
  answer?: (options?: { audio?: MediaTrackConstraints | boolean; video?: boolean }) => Promise<void> | void;
  dtmf?: (digits: string) => void;
  muteAudio?: () => void;
  unmuteAudio?: () => void;
};

type TelnyxClient = {
  remoteElement?: string;
  connect: () => void;
  disconnect: () => void;
  on: (eventName: string, callback: (...args: unknown[]) => void) => TelnyxClient;
  off: (eventName: string, callback?: (...args: unknown[]) => void) => TelnyxClient;
};

const LIVE_STATES = new Set(["answering", "active", "held"]);
const CLOSED_STATES = new Set(["hangup", "destroy", "purge"]);
const RINGING_STATES = new Set(["new", "requesting", "trying", "recovering", "ringing", "early"]);

function stateToken(stateRaw: unknown): string {
  if (typeof stateRaw === "string") return stateRaw.toLowerCase();
  if (typeof stateRaw === "number") {
    const map: Record<number, string> = {
      0: "new",
      1: "requesting",
      2: "trying",
      3: "recovering",
      4: "ringing",
      5: "answering",
      6: "early",
      7: "active",
      8: "held",
      9: "hangup",
      10: "destroy",
      11: "purge",
    };
    return map[stateRaw] ?? "";
  }
  return "";
}

function callIdentity(call: TelnyxCall | null): string | null {
  if (!call) return null;
  return (
    call.telnyxIDs?.telnyxCallControlId ?? call.telnyxIDs?.telnyxSessionId ?? call.id ?? null
  );
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function LevelDots({ level, label }: { level: number; label: string }) {
  const thresholds = [0.12, 0.3, 0.55, 0.8];
  return (
    <div className="flex flex-col items-center gap-1" role="img" aria-label={`${label}: ${(level * 100).toFixed(0)}%`}>
      <div className="flex flex-col-reverse gap-0.5">
        {thresholds.map((t) => (
          <span
            key={t}
            className={`block h-1.5 w-1.5 rounded-full ${level >= t ? "bg-emerald-500" : "bg-stone-300"}`}
          />
        ))}
      </div>
      <span className="select-none text-[9px] font-semibold uppercase tracking-wider text-stone-500">{label}</span>
    </div>
  );
}

export function PowerDialerPhone({
  campaignId,
  enabled,
  leadLabel,
  reportLeadId,
  hangupSignal,
  onStateChange,
}: Props) {
  // --- Lydopsætning -------------------------------------------------------
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionDone, setPermissionDone] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [micVerifyOk, setMicVerifyOk] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [manualHeadsetConfirm, setManualHeadsetConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const inputDevs = useMemo(() => devices.filter((d) => d.kind === "audioinput"), [devices]);
  const outputDevs = useMemo(() => devices.filter((d) => d.kind === "audiooutput"), [devices]);
  const needsSpeakerPick = outputDevs.length > 0 && !speakerId;
  const headsetBlockReason = useMemo(() => {
    if (!permissionDone || !micId) return null;
    return headsetSetupBlockedReason(labelForDeviceId(devices, micId), labelForDeviceId(devices, speakerId), {
      checkBuiltInSpeaker: outputDevs.length > 0 && Boolean(speakerId),
    });
  }, [permissionDone, micId, speakerId, devices, outputDevs.length]);
  const audioReady =
    permissionDone &&
    Boolean(micId) &&
    !needsSpeakerPick &&
    micVerifyOk &&
    inputDevs.length > 0 &&
    (!headsetBlockReason || manualHeadsetConfirm);

  // --- Telnyx-forbindelse og opkald ---------------------------------------
  const [registered, setRegistered] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [lineStatus, setLineStatus] = useState<PowerPhoneLineStatus>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [liveSince, setLiveSince] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [dtmfOpen, setDtmfOpen] = useState(false);
  const [, setTick] = useState(0);

  const clientRef = useRef<TelnyxClient | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const liveTalkRef = useRef<{ leadId: string | null; startedAt: number } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const enabledRef = useRef(enabled);
  const micIdRef = useRef(micId);
  const reportLeadIdRef = useRef(reportLeadId);
  const connectGenerationRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(3_000);
  const onStateChangeRef = useRef(onStateChange);
  const remoteAudioId = `power-dialer-remote-${campaignId}`;

  useEffect(() => {
    enabledRef.current = enabled;
    micIdRef.current = micId;
    reportLeadIdRef.current = reportLeadId;
    onStateChangeRef.current = onStateChange;
  });

  const webrtcReady = audioReady && registered;
  const problem = !permissionDone
    ? "Tillad mikrofon for at kunne modtage opkald."
    : inputDevs.length === 0
      ? "Ingen mikrofon fundet — tilslut headset."
      : !micId || needsSpeakerPick
        ? "Vælg headset som mikrofon og lydudgang."
        : !micVerifyOk
          ? verifyError
            ? `Mikrofon: ${verifyError}`
            : "Tjekker mikrofon…"
          : headsetBlockReason && !manualHeadsetConfirm
            ? headsetBlockReason
            : connectError
              ? connectError
              : !registered
                ? "Forbinder til telefonsystemet…"
                : null;

  useEffect(() => {
    onStateChangeRef.current({ webrtcReady, lineStatus, problem });
  }, [webrtcReady, lineStatus, problem]);

  // Auto-init: genbrug tidligere givet mikrofon-tilladelse og gemte enheder.
  useEffect(() => {
    let cancelled = false;
    const storedMic = readStoredDeviceId(VOIP_STORED_MIC_KEY);
    const storedSpk = readStoredDeviceId(VOIP_STORED_SPK_KEY);
    if (storedMic) setMicId(storedMic);
    if (storedSpk) setSpeakerId(storedSpk);
    void (async () => {
      try {
        const status = await navigator.permissions
          ?.query?.({ name: "microphone" as PermissionName })
          .catch(() => null);
        if (cancelled || status?.state !== "granted") return;
        const list = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        setDevices(list);
        setPermissionDone(true);
      } catch {
        /* sælgeren kan trykke «Tillad mikrofon» */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!permissionDone) {
      setSettingsOpen(true);
      return;
    }
    const onChange = async () => {
      try {
        setDevices(await navigator.mediaDevices.enumerateDevices());
      } catch {
        /* no-op */
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [permissionDone]);

  // Ryd valg af enheder der ikke længere findes.
  useEffect(() => {
    if (!permissionDone || (inputDevs.length === 0 && outputDevs.length === 0)) return;
    if (micId && inputDevs.length > 0 && !inputDevs.some((d) => d.deviceId === micId)) {
      setMicId("");
      writeStoredDeviceId(VOIP_STORED_MIC_KEY, "");
    }
    if (speakerId && outputDevs.length > 0 && !outputDevs.some((d) => d.deviceId === speakerId)) {
      setSpeakerId("");
      writeStoredDeviceId(VOIP_STORED_SPK_KEY, "");
    }
  }, [permissionDone, inputDevs, outputDevs, micId, speakerId]);

  useEffect(() => {
    if (!permissionDone || !micId) {
      setMicVerifyOk(false);
      setVerifyError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await verifyMicDevice(micId);
      if (cancelled) return;
      setMicVerifyOk(r.ok);
      setVerifyError(r.ok ? null : r.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionDone, micId]);

  useEffect(() => {
    if (!permissionDone || !micId) {
      setMicStream(null);
      return;
    }
    let cancelled = false;
    let active: MediaStream | null = null;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micId } } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        active = stream;
        setMicStream(stream);
      } catch {
        if (!cancelled) setMicStream(null);
      }
    })();
    return () => {
      cancelled = true;
      active?.getTracks().forEach((t) => t.stop());
      setMicStream(null);
    };
  }, [permissionDone, micId]);

  useEffect(() => {
    void setAudioElementSink(remoteAudioRef.current, speakerId);
  }, [speakerId]);

  useEffect(() => {
    if (audioReady && permissionDone) setSettingsOpen(false);
  }, [audioReady, permissionDone]);

  async function requestDevices() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSetupError("Denne browser understøtter ikke mikrofon til WebRTC.");
      return;
    }
    setSetupBusy(true);
    setSetupError(null);
    try {
      const list = await ensureMicPermissionAndEnumerate();
      setDevices(list);
      setPermissionDone(true);
      const inputs = list.filter((d) => d.kind === "audioinput");
      const outputs = list.filter((d) => d.kind === "audiooutput");
      const storedMic = readStoredDeviceId(VOIP_STORED_MIC_KEY);
      const storedSpk = readStoredDeviceId(VOIP_STORED_SPK_KEY);
      if (storedMic && inputs.some((i) => i.deviceId === storedMic)) setMicId(storedMic);
      else if (inputs.length === 1) {
        setMicId(inputs[0].deviceId);
        writeStoredDeviceId(VOIP_STORED_MIC_KEY, inputs[0].deviceId);
      }
      if (storedSpk && outputs.some((o) => o.deviceId === storedSpk)) setSpeakerId(storedSpk);
      else if (outputs.length === 1) {
        setSpeakerId(outputs[0].deviceId);
        writeStoredDeviceId(VOIP_STORED_SPK_KEY, outputs[0].deviceId);
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Mikrofon blev afvist eller er ikke tilgængelig.");
    } finally {
      setSetupBusy(false);
    }
  }

  const reportTalkSeconds = useCallback(() => {
    const talk = liveTalkRef.current;
    liveTalkRef.current = null;
    if (!talk?.leadId) return;
    const seconds = Math.round((Date.now() - talk.startedAt) / 1000);
    if (seconds <= 0) return;
    void fetch("/api/telnyx/webrtc/log-call-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: talk.leadId, connectedTalkSeconds: seconds }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const clearCall = useCallback(() => {
    activeCallRef.current = null;
    setRemoteStream(null);
    setLineStatus("idle");
    setLiveSince(null);
    setMuted(false);
    setDtmfOpen(false);
  }, []);

  const handleNotification = useCallback(
    (evt?: unknown) => {
      const payload = evt && typeof evt === "object" ? (evt as Record<string, unknown>) : {};
      const call = payload.call && typeof payload.call === "object" ? (payload.call as TelnyxCall) : null;
      if (!call) return;
      const token = stateToken(call.state);
      const current = activeCallRef.current;
      const isCurrent = current === call || (current && callIdentity(current) === callIdentity(call));

      if (CLOSED_STATES.has(token)) {
        if (isCurrent) {
          reportTalkSeconds();
          clearCall();
        }
        return;
      }

      if (!current || isCurrent) {
        if (!current) {
          if (call.direction !== "inbound" || !enabledRef.current) {
            // Power-sælgeren ringer ikke selv ud; uventede opkald afvises.
            void Promise.resolve(call.hangup?.()).catch(() => undefined);
            return;
          }
          activeCallRef.current = call;
          setLineStatus("ringing");
          try {
            const constraints = micIdRef.current
              ? ({ audio: { deviceId: { exact: micIdRef.current } } } as { audio: MediaTrackConstraints })
              : undefined;
            void Promise.resolve(call.answer?.(constraints)).catch((err) => {
              console.error("[power-phone] auto-svar fejlede:", err);
            });
          } catch (err) {
            console.error("[power-phone] auto-svar kald-fejl:", err);
          }
        }
        if (call.remoteStream) setRemoteStream(call.remoteStream);
        if (LIVE_STATES.has(token)) {
          setLineStatus("live");
          setLiveSince((prev) => prev ?? Date.now());
          if (!liveTalkRef.current) {
            liveTalkRef.current = { leadId: reportLeadIdRef.current, startedAt: Date.now() };
          }
        } else if (RINGING_STATES.has(token)) {
          setLineStatus((prev) => (prev === "live" ? prev : "ringing"));
        }
        return;
      }

      // Endnu et indgående opkald, mens sælgeren allerede er i et: afvis det.
      if (call.direction === "inbound" && RINGING_STATES.has(token)) {
        void Promise.resolve(call.hangup?.()).catch(() => undefined);
      }
    },
    [clearCall, reportTalkSeconds],
  );

  // Knyt det forbundne lead til taletiden, så snart leadet er vist.
  useEffect(() => {
    if (liveTalkRef.current && !liveTalkRef.current.leadId && reportLeadId) {
      liveTalkRef.current.leadId = reportLeadId;
    }
  }, [reportLeadId]);

  const disconnectClient = useCallback(() => {
    const client = clientRef.current;
    clientRef.current = null;
    setRegistered(false);
    if (client) {
      try {
        client.disconnect();
      } catch {
        /* no-op */
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const generation = ++connectGenerationRef.current;
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/telnyx/webrtc/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, voipApiContext: "power_session" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        loginToken?: string;
        error?: string;
        power?: { ready: boolean; message: string | null };
      };
      if (!res.ok || !json.loginToken) {
        throw new Error(json.error || `Kunne ikke hente login til telefonsystemet (HTTP ${res.status}).`);
      }
      if (json.power && !json.power.ready) {
        console.warn("[power-phone] Telnyx-klargøring:", json.power.message);
      }
      const mod = await import("@telnyx/webrtc");
      if (generation !== connectGenerationRef.current) return;
      const TelnyxRTC = mod.TelnyxRTC as unknown as new (options: {
        login_token?: string;
        region?: string;
        prefetchIceCandidates?: boolean;
        trickleIce?: boolean;
      }) => TelnyxClient;
      const client = new TelnyxRTC({
        login_token: json.loginToken,
        region: "eu",
        prefetchIceCandidates: true,
        trickleIce: true,
      });
      client.remoteElement = remoteAudioId;
      clientRef.current = client;

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Timeout ved forbindelse til telefonsystemet."));
        }, 15_000);
        client.on("telnyx.ready", () => {
          if (generation !== connectGenerationRef.current) return;
          setRegistered(true);
          setConnectError(null);
          retryDelayRef.current = 3_000;
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            resolve();
          }
        });
        const onFail = (evt?: unknown) => {
          if (generation !== connectGenerationRef.current) return;
          setRegistered(false);
          const p = evt && typeof evt === "object" ? (evt as Record<string, unknown>) : {};
          const msg = typeof p.message === "string" ? p.message : "Forbindelsen til telefonsystemet blev afbrudt.";
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(msg));
            return;
          }
          setConnectError(msg);
          scheduleReconnect();
        };
        client.on("telnyx.error", onFail);
        client.on("telnyx.socket.error", onFail);
        client.on("telnyx.socket.close", onFail);
        client.on("telnyx.notification", handleNotification);
        client.connect();
      });
    } catch (err) {
      if (generation !== connectGenerationRef.current) return;
      disconnectClient();
      setConnectError(err instanceof Error ? err.message : "Kunne ikke forbinde til telefonsystemet.");
      scheduleReconnect();
    } finally {
      if (generation === connectGenerationRef.current) setConnecting(false);
    }
    // scheduleReconnect er stabil via ref-logik nedenfor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, remoteAudioId, handleNotification, disconnectClient]);

  const connectRef = useRef(connect);
  useEffect(() => {
    connectRef.current = connect;
  });

  function scheduleReconnect() {
    if (retryTimerRef.current !== null) return;
    if (activeCallRef.current) return;
    const delay = retryDelayRef.current;
    retryDelayRef.current = Math.min(retryDelayRef.current * 2, 15_000);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (!enabledRef.current) return;
      disconnectClient();
      void connectRef.current();
    }, delay);
  }

  // Forbind, når lyden er klar. Overtages sessionen af en anden fane, afregistreres denne telefon
  // (Telnyx sender kun opkald til den seneste registrering af samme credential).
  useEffect(() => {
    if (!enabled) {
      if (!activeCallRef.current) {
        connectGenerationRef.current += 1;
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        disconnectClient();
      }
      return;
    }
    if (!audioReady || clientRef.current) return;
    void connectRef.current();
  }, [audioReady, enabled, disconnectClient]);

  useEffect(() => {
    return () => {
      connectGenerationRef.current += 1;
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      try {
        void activeCallRef.current?.hangup?.();
      } catch {
        /* no-op */
      }
      activeCallRef.current = null;
      const client = clientRef.current;
      clientRef.current = null;
      try {
        client?.disconnect();
      } catch {
        /* no-op */
      }
    };
  }, []);

  const hangUp = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    reportTalkSeconds();
    try {
      void Promise.resolve(call.hangup?.()).catch(() => undefined);
    } catch {
      /* no-op */
    }
    clearCall();
  }, [clearCall, reportTalkSeconds]);

  const hangupSignalRef = useRef(hangupSignal);
  useEffect(() => {
    if (hangupSignal === hangupSignalRef.current) return;
    hangupSignalRef.current = hangupSignal;
    hangUp();
  }, [hangupSignal, hangUp]);

  // Uret under samtale.
  useEffect(() => {
    if (liveSince === null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveSince]);

  const toggleMute = () => {
    const call = activeCallRef.current;
    if (!call) return;
    try {
      if (muted) call.unmuteAudio?.();
      else call.muteAudio?.();
      setMuted(!muted);
    } catch {
      /* no-op */
    }
  };

  const outLevel = useAudioLevel(micStream);
  const inLevel = useAudioLevel(lineStatus === "live" ? remoteStream : null);
  const durationLabel = liveSince ? formatDuration((Date.now() - liveSince) / 1000) : "00:00";

  const pill =
    lineStatus === "live"
      ? { text: `I samtale ${durationLabel}`, cls: "border-emerald-300 bg-emerald-50 text-emerald-800", dot: "bg-emerald-500" }
      : lineStatus === "ringing"
        ? { text: "Forbinder samtale…", cls: "border-amber-300 bg-amber-50 text-amber-800", dot: "bg-amber-500" }
        : webrtcReady
          ? { text: "Telefon klar", cls: "border-emerald-200 bg-white text-emerald-800", dot: "bg-emerald-500" }
          : connecting
            ? { text: "Forbinder…", cls: "border-amber-300 bg-amber-50 text-amber-800", dot: "bg-amber-500" }
            : { text: "Telefon ikke klar", cls: "border-red-300 bg-red-50 text-red-700", dot: "bg-red-500" };

  return (
    <section
      className="rounded-2xl border border-emerald-200/80 bg-white px-4 py-3 shadow-sm"
      aria-label="Power Dialer telefon"
    >
      <audio ref={remoteAudioRef} id={remoteAudioId} autoPlay playsInline />
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${pill.cls}`}
          aria-live="polite"
        >
          <span className={`h-2 w-2 rounded-full ${pill.dot} ${lineStatus !== "idle" ? "motion-safe:animate-pulse" : ""}`} />
          {pill.text}
        </span>
        {lineStatus !== "idle" && leadLabel ? (
          <span className="truncate text-sm font-medium text-stone-800">{leadLabel}</span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-center gap-3 rounded-md border border-stone-200 bg-white/80 px-2.5 py-1.5">
            <LevelDots level={outLevel} label="Ud" />
            <LevelDots level={lineStatus === "live" ? inLevel : 0} label="Ind" />
          </div>
          {lineStatus === "live" ? (
            <>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                  muted ? "border-amber-400 bg-amber-500 text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {muted ? "Lyd slået fra" : "Slå lyd fra"}
              </button>
              <button
                type="button"
                onClick={() => setDtmfOpen((v) => !v)}
                aria-expanded={dtmfOpen}
                className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm hover:bg-stone-50"
              >
                Taster
              </button>
            </>
          ) : null}
          {lineStatus !== "idle" ? (
            <button
              type="button"
              onClick={hangUp}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-md transition hover:bg-red-700"
              aria-label="Læg på"
              title="Læg på"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-expanded={settingsOpen}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
              settingsOpen
                ? "border-emerald-500 bg-emerald-600 text-white"
                : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
            }`}
          >
            Lydindstillinger
          </button>
        </div>
      </div>

      {problem && lineStatus === "idle" ? (
        <p className="mt-2 text-xs font-medium text-red-700" role="status">
          {problem}
          {connectError ? (
            <button
              type="button"
              onClick={() => {
                if (retryTimerRef.current !== null) {
                  window.clearTimeout(retryTimerRef.current);
                  retryTimerRef.current = null;
                }
                retryDelayRef.current = 3_000;
                disconnectClient();
                void connectRef.current();
              }}
              className="ml-2 underline underline-offset-2"
            >
              Prøv igen
            </button>
          ) : null}
        </p>
      ) : null}

      {dtmfOpen && lineStatus === "live" ? (
        <div className="mx-auto mt-3 grid max-w-[11rem] grid-cols-3 gap-2" role="group" aria-label="Taster">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => activeCallRef.current?.dtmf?.(d)}
              className="rounded-lg border border-stone-200 bg-white py-2 text-sm font-semibold text-stone-900 shadow-sm hover:bg-stone-50"
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-3 py-3">
          {!permissionDone ? (
            <div>
              <button
                type="button"
                onClick={() => void requestDevices()}
                disabled={setupBusy}
                className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-800 disabled:opacity-60"
              >
                {setupBusy ? "Åbner mikrofon…" : "Tillad mikrofon"}
              </button>
              {setupError ? (
                <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                  {setupError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-emerald-900/90">
                Mikrofon ({inputDevs.length})
                <select
                  value={micId}
                  onChange={(e) => {
                    setMicId(e.target.value);
                    setManualHeadsetConfirm(false);
                    writeStoredDeviceId(VOIP_STORED_MIC_KEY, e.target.value);
                  }}
                  className="mt-1 w-full rounded-md border border-emerald-200/80 bg-white px-2 py-2 text-sm text-stone-900"
                >
                  <option value="">Vælg mikrofon…</option>
                  {inputDevs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Mikrofon (${d.deviceId.slice(0, 8)}…)`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px] font-medium text-emerald-900/90">
                Lydudgang ({outputDevs.length})
                {outputDevs.length === 0 ? (
                  <span className="mt-2 block rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] font-normal text-amber-900">
                    Browseren viser ingen separate lydudgange — systemets standard bruges.
                  </span>
                ) : (
                  <select
                    value={speakerId}
                    onChange={(e) => {
                      setSpeakerId(e.target.value);
                      setManualHeadsetConfirm(false);
                      writeStoredDeviceId(VOIP_STORED_SPK_KEY, e.target.value);
                    }}
                    className="mt-1 w-full rounded-md border border-emerald-200/80 bg-white px-2 py-2 text-sm text-stone-900"
                  >
                    <option value="">Vælg headset…</option>
                    {outputDevs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Output (${d.deviceId.slice(0, 8)}…)`}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              {headsetBlockReason ? (
                <label className="flex cursor-pointer items-start gap-2 text-[11px] text-stone-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={manualHeadsetConfirm}
                    onChange={(e) => setManualHeadsetConfirm(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-stone-400 text-emerald-700"
                  />
                  <span>
                    {headsetBlockReason} <strong>Ved tvivl:</strong> jeg bekræfter, at jeg bruger headset med mikrofon.
                  </span>
                </label>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

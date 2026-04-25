"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CampaignDialMode } from "@/lib/dial-mode";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";
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
import { describeVoipCallFailureForUi, describeVoipStartupFailure } from "@/lib/voip-call-messages";

type Props = {
  leadId: string;
  campaignId: string;
  /** Telefon på leadet (fra server) — bruges som udgangspunkt for opkaldsfeltet ved nyt lead */
  leadPhone: string;
  dialMode: CampaignDialMode;
  /** Predictive + power (efter connect): start opkald automatisk ved nyt lead */
  autoStartCall: boolean;
  /**
   * Predictive-mode: kaldes hvis modtageren ikke tager telefonen indenfor `unansweredTimeoutMs`.
   * Workspace bruger typisk dette til at gå videre til næste lead automatisk.
   */
  onUnansweredTimeout?: () => void;
  /** Antal millisekunder før Predictive-modus giver op og kalder `onUnansweredTimeout`. */
  unansweredTimeoutMs?: number;
  /**
   * Kaldes hver gang strip'ens lineStatus skifter — workspace kan derved rapportere
   * agentens status til server-side dispatcher (ready/ringing/talking).
   */
  onLineStatusChange?: (status: LineStatus) => void;
  /** Øges af parent når et aktivt opkald skal afsluttes programmatisk (fx Gem og næste). */
  hangupSignal?: number;
  /** Kaldes når `hangupSignal` er håndteret (uanset om der var aktivt opkald). */
  onHangupSignalHandled?: () => void;
  /** Når en VoIP fejl logges i aktivitet, så kampagnekøen kan hente tidslinje igen. */
  onVoipFailureLogged?: () => void;
};

export type LineStatus = "idle" | "connecting" | "ringing" | "live" | "error";

type TelnyxClient = {
  remoteElement?: string;
  connect: () => void;
  disconnect: () => void;
  newCall: (options: {
    destinationNumber?: string;
    callerNumber?: string;
    remoteElement?: string;
    micId?: string;
    speakerId?: string;
    audio?: MediaTrackConstraints | boolean;
    localStream?: MediaStream;
    /// Base64-encoded JSON som Telnyx echoer på alle webhooks for dette opkald.
    /// Vi bruger det til at korrelere call_control_id → leadId/userId/campaignId,
    /// så optagelse kan startes og lead-aktivitet kan oprettes automatisk.
    clientState?: string;
  }) => unknown;
  on: (eventName: string, callback: (...args: unknown[]) => void) => TelnyxClient;
  off: (eventName: string, callback?: (...args: unknown[]) => void) => TelnyxClient;
};

type TelnyxCall = {
  state?: unknown;
  /// Hvor opkaldet kommer fra: outbound = vi ringede ud, inbound = vi modtog opkald (bridge fra dispatcher)
  direction?: "outbound" | "inbound";
  options?: { destinationNumber?: string; remoteCallerName?: string };
  /** Telnyx server-side call leg — sættes når opkallet er forbundet (Call Control). */
  telnyxIDs?: { telnyxCallControlId?: string; telnyxSessionId?: string; telnyxLegId?: string };
  cause?: string;
  causeCode?: number;
  sipReason?: string;
  sipCode?: number;
  hangup?: () => Promise<void> | void;
  answer?: (options?: { audio?: MediaTrackConstraints | boolean; video?: boolean }) => Promise<void> | void;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
};

function normalizeDialDraft(s: string) {
  return s.replace(/\s/g, "").trim();
}

/**
 * Verto/SIP-call states fra Telnyx WebRTC SDK:
 *   new / requesting / trying / recovering  → vi er ved at sende INVITE
 *                                              eller venter på første provisional response.
 *                                              Modtagerens telefon ringer IKKE endnu.
 *   ringing / early                          → vi har modtaget 180/183 fra operatøren —
 *                                              modtagerens telefon ringer faktisk nu.
 *   answering / active                       → opkaldet er taget, medie flyder.
 *   hangup / destroy / purge                 → afsluttet.
 */
const CONNECTING_STATES = new Set(["new", "requesting", "trying", "recovering"]);
const ALERTING_STATES = new Set(["ringing", "early"]);
const LIVE_STATES = new Set(["answering", "active", "held"]);
const CLOSED_STATES = new Set(["hangup", "destroy", "purge"]);

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

function callStateToLineStatus(stateRaw: unknown): LineStatus | null {
  const token = stateToken(stateRaw);
  if (!token) return null;
  if (CLOSED_STATES.has(token)) return "idle";
  if (LIVE_STATES.has(token)) return "live";
  if (ALERTING_STATES.has(token)) return "ringing";
  if (CONNECTING_STATES.has(token)) return "connecting";
  return null;
}

function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function AudioLevelBar({
  level,
  label,
  variant,
}: {
  level: number;
  label: string;
  variant: "out" | "in";
}) {
  // 4 prikker — tænder nedefra og op ved ~0.12, 0.30, 0.55, 0.80.
  const thresholds = [0.12, 0.3, 0.55, 0.8];
  const activeColor = variant === "out" ? "bg-emerald-500" : "bg-sky-500";
  const activeGlow = variant === "out" ? "shadow-[0_0_4px_rgba(16,185,129,0.9)]" : "shadow-[0_0_4px_rgba(14,165,233,0.9)]";
  return (
    <div
      className="flex flex-col items-center gap-1"
      role="img"
      aria-label={`${label}: niveau ${(level * 100).toFixed(0)}%`}
    >
      <div className="flex flex-col-reverse gap-0.5">
        {thresholds.map((t, i) => {
          const on = level >= t;
          return (
            <span
              key={i}
              className={`block h-1.5 w-1.5 rounded-full transition-colors ${
                on ? `${activeColor} ${activeGlow}` : "bg-stone-300"
              }`}
            />
          );
        })}
      </div>
      <span className="select-none text-[9px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </span>
    </div>
  );
}

export function CampaignVoipStrip({
  leadId,
  campaignId,
  leadPhone,
  dialMode,
  autoStartCall,
  onUnansweredTimeout,
  unansweredTimeoutMs = 25_000,
  onLineStatusChange,
  hangupSignal = 0,
  onHangupSignalHandled,
  onVoipFailureLogged,
}: Props) {
  const [lineStatus, setLineStatus] = useState<LineStatus>("idle");

  // Notér ændringer i lineStatus til parent (bruges af dialer-presence-hook)
  const onLineStatusRef = useRef(onLineStatusChange);
  onLineStatusRef.current = onLineStatusChange;
  useEffect(() => {
    onLineStatusRef.current?.(lineStatus);
  }, [lineStatus]);
  const [detail, setDetail] = useState<string | null>(null);
  const [voipToast, setVoipToast] = useState<string | null>(null);
  const [voipToastFading, setVoipToastFading] = useState(false);
  const endCallInitiatedByUsRef = useRef(false);
  const callHadConnectedRef = useRef(false);
  const [dialDraft, setDialDraft] = useState(() => (leadPhone || "").trim());

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
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshInfo, setRefreshInfo] = useState<string | null>(null);

  const [callStartAt, setCallStartAt] = useState<number | null>(null);
  const [callEndAt, setCallEndAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  /**
   * Persistent mikrofon-stream — én getUserMedia for hele session.
   * Bruges både til niveau-måling og som localStream på Telnyx-newCall
   * (vi sender en klon ind, så SDK'en springer sin egen getUserMedia over).
   * Klonen kan SDK'en stoppe når opkaldet ender uden at påvirke originalen.
   */
  const [micMonitorStream, setMicMonitorStream] = useState<MediaStream | null>(null);

  const clientRef = useRef<TelnyxClient | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const callerNumberRef = useRef<string>("");
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const inFlightRef = useRef(false);
  const autoKeyRef = useRef<string | null>(null);
  const lastLeadIdRef = useRef<string | null>(null);
  const hangupSignalRef = useRef(hangupSignal);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * Pre-fetched clientState til WebRTC click-to-call. Telnyx echoer denne string på
   * alle webhooks, så vi kan korrelere call_control_id → leadId og automatisk
   * starte optagelse + oprette CALL_RECORDING-aktivitet i lead-historikken.
   * Hentes parallelt med WebRTC pre-warm for nul ekstra latency på klik.
   */
  const manualClientStateRef = useRef<string | null>(null);

  /**
   * Refs der peger på up-to-date props/state — bruges i langlivede SDK-callbacks
   * (telnyx.notification) hvor vi ellers ville fange initial-værdier fra closure.
   */
  const autoStartCallRef = useRef(autoStartCall);
  autoStartCallRef.current = autoStartCall;
  const dialModeRef = useRef(dialMode);
  dialModeRef.current = dialMode;
  const micIdRef = useRef("");
  const audioSetupReadyRef = useRef(false);

  const remoteAudioId = `voip-remote-audio-${leadId}`;

  const pushVoipToast = useCallback((text: string) => {
    setVoipToastFading(false);
    setVoipToast(text);
  }, []);

  const logVoipFailureToServer = useCallback(
    async (userText: string, technical: string) => {
      try {
        const res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/log-voip-failure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage: userText, technical }),
        });
        if (res.ok) {
          onVoipFailureLogged?.();
        }
      } catch {
        /* logging må ikke blokkere opkald igen */
      }
    },
    [leadId, onVoipFailureLogged],
  );

  const reportVoipFailure = useCallback(
    (userText: string, technical: string) => {
      pushVoipToast(userText);
      void logVoipFailureToServer(userText, technical);
    },
    [logVoipFailureToServer, pushVoipToast],
  );
  const reportVoipFailureRef = useRef(reportVoipFailure);
  reportVoipFailureRef.current = reportVoipFailure;

  useEffect(() => {
    if (!voipToast) {
      setVoipToastFading(false);
      return;
    }
    setVoipToastFading(false);
    const tFade = window.setTimeout(() => setVoipToastFading(true), 2200);
    const tClear = window.setTimeout(() => {
      setVoipToast(null);
      setVoipToastFading(false);
    }, 2800);
    return () => {
      clearTimeout(tFade);
      clearTimeout(tClear);
    };
  }, [voipToast]);

  const inputDevs = useMemo(() => devices.filter((d) => d.kind === "audioinput"), [devices]);
  const outputDevs = useMemo(() => devices.filter((d) => d.kind === "audiooutput"), [devices]);

  const micLabel = micId ? labelForDeviceId(devices, micId) : "";
  const spkLabel = speakerId ? labelForDeviceId(devices, speakerId) : "";

  const needsSpeakerPick = outputDevs.length > 0 && !speakerId;

  const headsetBlockReason = useMemo(() => {
    if (!permissionDone || !micId) return null;
    return headsetSetupBlockedReason(micLabel, spkLabel, {
      checkBuiltInSpeaker: outputDevs.length > 0 && Boolean(speakerId),
    });
  }, [permissionDone, micId, micLabel, spkLabel, outputDevs.length, speakerId]);

  const headsetBlockedEffective = Boolean(headsetBlockReason) && !manualHeadsetConfirm;

  const audioSetupReady =
    permissionDone &&
    Boolean(micId) &&
    !needsSpeakerPick &&
    micVerifyOk &&
    !headsetBlockedEffective &&
    inputDevs.length > 0;

  // Synk refs så telnyx.notification-handleren altid ser nyeste værdier
  useEffect(() => {
    micIdRef.current = micId;
    audioSetupReadyRef.current = audioSetupReady;
  }, [micId, audioSetupReady]);

  const activeCall =
    lineStatus === "ringing" || lineStatus === "live" || lineStatus === "connecting";
  const canPlaceCall = audioSetupReady && !activeCall;

  const outLevel = useAudioLevel(micMonitorStream);
  const inLevel = useAudioLevel(activeCall ? remoteStream : null);

  useEffect(() => {
    if (!callStartAt) return;
    const end = callEndAt;
    if (end) {
      setNowTick(end);
      return;
    }
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [callStartAt, callEndAt]);

  const shownSeconds = useMemo(() => {
    if (!callStartAt) return 0;
    const end = callEndAt ?? nowTick;
    return Math.max(0, (end - callStartAt) / 1000);
  }, [callStartAt, callEndAt, nowTick]);

  useEffect(() => {
    if (lastLeadIdRef.current === leadId) return;
    lastLeadIdRef.current = leadId;
    setDialDraft((leadPhone || "").trim());
    setLineStatus("idle");
    setDetail(null);
    setVoipToast(null);
    setVoipToastFading(false);
    endCallInitiatedByUsRef.current = false;
    callHadConnectedRef.current = false;
    autoKeyRef.current = null;
    setManualHeadsetConfirm(false);
    setCallStartAt(null);
    setCallEndAt(null);
    setRemoteStream(null);
    // Kun nyt lead — ikke når brugeren retter telefonfeltet på leadet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  /** Pre-load Telnyx WebRTC SDK-chunken så snart komponenten mountes,
   *  så den er klar i memory inden brugeren trykker «Ring op». */
  useEffect(() => {
    void import("@telnyx/webrtc").catch(() => {
      /* dyret håndteres når ensureClientConnected køres */
    });
  }, []);

  /**
   * Auto-init: når brugeren allerede har givet mikrofon-tilladelse (typisk via
   * «Lydindstillinger»-knappen på /kampagner-forsiden) genbruger vi det valg
   * uden at agenten skal klikke «Tillad mikrofon» igen inde i strippen.
   */
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
        if (cancelled) return;
        if (status?.state === "granted") {
          const list = await navigator.mediaDevices.enumerateDevices();
          if (cancelled) return;
          setDevices(list);
          setPermissionDone(true);
        }
      } catch {
        /* no-op — bruger kan trykke «Tillad mikrofon» */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (!permissionDone) return;
    const onChange = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list);
      } catch {
        /* no-op */
      }
    };
    navigator.mediaDevices.addEventListener("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onChange);
  }, [permissionDone]);

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
      if (r.ok) {
        setMicVerifyOk(true);
        setVerifyError(null);
      } else {
        setMicVerifyOk(false);
        setVerifyError(r.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionDone, micId]);

  /**
   * Persistent mikrofon-stream — kører hele tiden så længe permission + micId
   * er sat. Bruges til niveau-måling, og en klon sendes til Telnyx newCall så
   * SDK'en undgår sin egen getUserMedia (sparer 100-300 ms på opkaldsstart).
   */
  useEffect(() => {
    if (!permissionDone || !micId) {
      setMicMonitorStream(null);
      return;
    }
    let cancelled = false;
    let active: MediaStream | null = null;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: micId } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        active = stream;
        setMicMonitorStream(stream);
      } catch {
        if (!cancelled) setMicMonitorStream(null);
      }
    })();
    return () => {
      cancelled = true;
      if (active) active.getTracks().forEach((t) => t.stop());
      setMicMonitorStream(null);
    };
  }, [permissionDone, micId]);

  useEffect(() => {
    void setAudioElementSink(remoteAudioRef.current, speakerId);
  }, [speakerId]);

  /**
   * Pre-warm WebRTC: så snart audio-setup er klar, etabler login + WebSocket
   * til Telnyx i baggrunden. Når brugeren klikker «Ring op» springer vi direkte
   * til newCall (ingen token-fetch, SDK-import eller handshake i klik-pathen).
   * Klienten cleanes op af unmount-effekten.
   */
  useEffect(() => {
    if (!audioSetupReady) return;
    if (clientRef.current || initPromiseRef.current) return;
    void ensureClientConnected().catch(() => {
      /* fejl rapporteres når brugeren faktisk forsøger at ringe */
    });
    // ensureClientConnected er stabil per render — vi vil kun re-trigge når audioSetupReady ændres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSetupReady]);

  /**
   * Pre-fetch clientState når leadId ændres. clientState pakker {leadId, userId, campaignId}
   * som Telnyx echoer på alle webhooks for opkaldet. Webhook'en bruger det til at:
   *   1. starte recording når lead besvarer (kind=manual)
   *   2. oprette en afspilbar CALL_RECORDING-aktivitet på leadet når optagelsen er klar
   * Fejl fanges stille — opkald virker stadig, blot uden auto-recording.
   */
  useEffect(() => {
    manualClientStateRef.current = null;
    if (!leadId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/telnyx/manual-call/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; clientState?: string };
        if (!cancelled && typeof data?.clientState === "string") {
          manualClientStateRef.current = data.clientState;
        }
      } catch {
        /* opkald skal stadig kunne placeres uden recording-korrelation */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  /**
   * Registrér Telnyx call_control_id for det aktive WebRTC-opkald på AgentSession.
   * Bruges af admin-metrics og fremtidig optimering af bridge; rydes ved idle.
   */
  useEffect(() => {
    if (!campaignId) return;

    if (lineStatus === "idle" || lineStatus === "error") {
      void fetch("/api/dialer/agent/call-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, callControlId: null }),
        credentials: "include",
      }).catch(() => {});
      return;
    }

    let ticks = 0;
    const interval = window.setInterval(() => {
      ticks += 1;
      const call = activeCallRef.current;
      const cc = call?.telnyxIDs?.telnyxCallControlId;
      if (cc) {
        void fetch("/api/dialer/agent/call-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, callControlId: cc }),
          credentials: "include",
        }).catch(() => {});
        window.clearInterval(interval);
        return;
      }
      if (ticks >= 40) window.clearInterval(interval);
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, [lineStatus, campaignId]);

  useEffect(() => {
    return () => {
      if (!campaignId) return;
      void fetch("/api/dialer/agent/call-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, callControlId: null }),
        credentials: "include",
      }).catch(() => {});
    };
  }, [campaignId]);

  /**
   * Ryd ugyldige valg — men kun når enhedslisten faktisk er indlæst.
   * Ellers kan vi komme til at slette agentens gemte headset i den korte
   * periode mellem mount og enumerateDevices().
   */
  useEffect(() => {
    if (!permissionDone) return;
    if (inputDevs.length === 0 && outputDevs.length === 0) return;
    if (micId && inputDevs.length > 0 && !inputDevs.some((d) => d.deviceId === micId)) {
      setMicId("");
      setManualHeadsetConfirm(false);
      writeStoredDeviceId(VOIP_STORED_MIC_KEY, "");
    }
    if (speakerId && outputDevs.length > 0 && !outputDevs.some((d) => d.deviceId === speakerId)) {
      setSpeakerId("");
      setManualHeadsetConfirm(false);
      writeStoredDeviceId(VOIP_STORED_SPK_KEY, "");
    }
  }, [permissionDone, inputDevs, outputDevs, micId, speakerId]);

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

      const storedMic = readStoredDeviceId(VOIP_STORED_MIC_KEY);
      const storedSpk = readStoredDeviceId(VOIP_STORED_SPK_KEY);
      const inputs = list.filter((d) => d.kind === "audioinput");
      const outputs = list.filter((d) => d.kind === "audiooutput");

      if (storedMic && inputs.some((i) => i.deviceId === storedMic)) {
        setMicId(storedMic);
      } else if (inputs.length === 1) {
        const only = inputs[0].deviceId;
        setMicId(only);
        writeStoredDeviceId(VOIP_STORED_MIC_KEY, only);
      }

      if (storedSpk && outputs.some((o) => o.deviceId === storedSpk)) {
        setSpeakerId(storedSpk);
      } else if (outputs.length === 1) {
        const only = outputs[0].deviceId;
        setSpeakerId(only);
        writeStoredDeviceId(VOIP_STORED_SPK_KEY, only);
      }
    } catch (e) {
      setSetupError(
        e instanceof Error ? e.message : "Mikrofon blev afvist eller er ikke tilgængelig.",
      );
    } finally {
      setSetupBusy(false);
    }
  }

  /** Tving re-enumerate (fx når headset tilsluttes efter permission). */
  async function refreshDevices() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    setRefreshBusy(true);
    setRefreshInfo(null);
    try {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        /* no-op — enumerate kan stadig give deviceIds (uden labels) */
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      if (!permissionDone) setPermissionDone(true);
      const inputs = list.filter((d) => d.kind === "audioinput").length;
      const outputs = list.filter((d) => d.kind === "audiooutput").length;
      setRefreshInfo(`Fundet ${inputs} mikrofon${inputs === 1 ? "" : "er"} og ${outputs} lydudgang${outputs === 1 ? "" : "e"}.`);
    } catch (e) {
      setRefreshInfo(
        e instanceof Error ? `Kunne ikke genlæse: ${e.message}` : "Kunne ikke genlæse enhedsliste.",
      );
    } finally {
      setRefreshBusy(false);
    }
  }

  function clearCallAudioState(finalizeTimer: boolean) {
    setRemoteStream(null);
    if (finalizeTimer) {
      setCallEndAt((prev) => (prev ?? Date.now()));
    }
  }

  function attachCallStreams(call: TelnyxCall | null) {
    if (!call) return;
    if (call.remoteStream) setRemoteStream(call.remoteStream);
  }

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
        telnyxStatus?: number;
        telephonyCredentialIdHint?: string;
        credentialStatus?: string | null;
        credentialExpired?: boolean | null;
        credentialExpiresAt?: string | null;
        credentialConnectionId?: string | null;
        credentialFetchError?: string | null;
        diagnosticHint?: string | null;
      };
      if (!tokenRes.ok || !tokenJson.loginToken) {
        const base =
          typeof tokenJson.message === "string"
            ? tokenJson.message
            : typeof tokenJson.error === "string"
              ? tokenJson.error
              : "Kunne ikke hente WebRTC login token";
        const code = typeof tokenJson.code === "string" && tokenJson.code.trim() ? ` [${tokenJson.code}]` : "";
        const extras: string[] = [];
        if (typeof tokenJson.telnyxStatus === "number" && tokenJson.telnyxStatus > 0) {
          extras.push(`Telnyx ${tokenJson.telnyxStatus}`);
        }
        if (
          typeof tokenJson.telephonyCredentialIdHint === "string" &&
          tokenJson.telephonyCredentialIdHint.trim()
        ) {
          extras.push(`cred ${tokenJson.telephonyCredentialIdHint.trim()}`);
        }
        if (tokenJson.credentialExpired === true) extras.push("expired");
        else if (typeof tokenJson.credentialStatus === "string" && tokenJson.credentialStatus) {
          extras.push(`status: ${tokenJson.credentialStatus}`);
        }
        const suffix = extras.length ? ` (${extras.join(", ")})` : "";
        throw new Error(`${base}${code}${suffix}`);
      }

      callerNumberRef.current = (tokenJson.callerNumber || "").trim();

      const mod = await import("@telnyx/webrtc");
      const TelnyxRTC = mod.TelnyxRTC as new (options: {
        login_token?: string;
        region?: string;
        prefetchIceCandidates?: boolean;
        trickleIce?: boolean;
      }) => TelnyxClient;
      // region:"eu" → SDK forbinder til wss://rtc-eu.telnyx.com (lavere latency fra DK).
      // prefetchIceCandidates + trickleIce → hurtigere medie-setup ved opkaldsstart.
      const client = new TelnyxRTC({
        login_token: tokenJson.loginToken,
        region: "eu",
        prefetchIceCandidates: true,
        trickleIce: true,
      });
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

          const stateT = stateToken(maybeCall.state);
          if (CLOSED_STATES.has(stateT)) {
            const initiatedByUs = endCallInitiatedByUsRef.current;
            endCallInitiatedByUsRef.current = false;
            const hadLive = callHadConnectedRef.current;
            callHadConnectedRef.current = false;
            const sipCode = Number((maybeCall as TelnyxCall).sipCode) || 0;
            const cause = String((maybeCall as TelnyxCall).cause ?? "");
            const sipReason = String((maybeCall as TelnyxCall).sipReason ?? "");
            activeCallRef.current = null;
            clearCallAudioState(true);
            setLineStatus("idle");
            setDetail(null);
            setCallEndAt(Date.now());
            if (!initiatedByUs) {
              const desc = describeVoipCallFailureForUi({ hadLive, sipCode, cause, sipReason });
              if (desc) {
                reportVoipFailureRef.current(desc.userText, desc.technical);
              }
            }
            return;
          }

          // Detektér INDKOMMENDE bridge fra server-side dispatcher.
          // Hvis dialMode er auto-dial og autoStartCall er aktiv (= ikke pause),
          // svarer vi automatisk så samtalen flyder uden agent-input.
          const isInbound = maybeCall.direction === "inbound";
          const previouslyNoCall = activeCallRef.current == null || activeCallRef.current === maybeCall;
          const shouldAutoAnswer =
            isInbound &&
            previouslyNoCall &&
            (dialModeRef.current === "POWER_DIALER" || dialModeRef.current === "PREDICTIVE") &&
            autoStartCallRef.current &&
            audioSetupReadyRef.current &&
            typeof maybeCall.answer === "function";

          activeCallRef.current = maybeCall;
          attachCallStreams(maybeCall);
          const mapped = callStateToLineStatus(maybeCall.state);
          if (mapped) {
            if (mapped === "live") {
              callHadConnectedRef.current = true;
            }
            setLineStatus(mapped);
          }

          if (shouldAutoAnswer) {
            try {
              const answerArg = micIdRef.current
                ? { audio: { deviceId: { exact: micIdRef.current } } as MediaTrackConstraints }
                : undefined;
              const r = maybeCall.answer?.(answerArg);
              if (r && typeof (r as Promise<void>).then === "function") {
                (r as Promise<void>).catch((err) => {
                  console.error("[voip] auto-answer fejlede:", err);
                });
              }
            } catch (err) {
              console.error("[voip] auto-answer kald-fejl:", err);
            }
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
    if (!audioSetupReady) {
      setLineStatus("idle");
      setDetail(null);
      pushVoipToast(
        "Tilslut headset med mikrofon, tillad mikrofon, og vælg rigtige enheder før du ringer.",
      );
      return;
    }
    if (inFlightRef.current) return;
    const raw = normalizeDialDraft(dialDraft);
    const toE164 = normalizePhoneToE164ForDial(raw);
    if (!toE164) {
      setLineStatus("idle");
      setDetail(null);
      reportVoipFailure("Ugyldigt telefonnummer", "client: invalid E.164 / 8 digits");
      return;
    }

    inFlightRef.current = true;
    endCallInitiatedByUsRef.current = false;
    callHadConnectedRef.current = false;
    setLineStatus("connecting");
    // Hvis klienten allerede er pre-warmet, skip "Forbinder WebRTC…"-flash.
    setDetail(clientRef.current ? null : "Forbinder WebRTC…");
    setCallStartAt(Date.now());
    setCallEndAt(null);
    try {
      await ensureClientConnected();
      if (!clientRef.current) throw new Error("WebRTC-klient blev ikke initialiseret.");

      await setAudioElementSink(remoteAudioRef.current, speakerId);

      const callOptions: Parameters<TelnyxClient["newCall"]>[0] = {
        destinationNumber: toE164,
        callerNumber: callerNumberRef.current || undefined,
        remoteElement: remoteAudioId,
      };
      if (speakerId) {
        callOptions.speakerId = speakerId;
      }
      // Genbrug pre-warmet mic-stream → SDK'en springer sin getUserMedia over
      // og medie-pathen er klar med det samme. Klonen ejes af SDK'en (stoppes
      // når opkaldet ender), originalen lever videre til niveau-måling.
      if (micMonitorStream) {
        callOptions.localStream = micMonitorStream.clone();
      } else {
        callOptions.micId = micId;
      }
      // Send clientState så Telnyx kan korrelere webhooks → leadId/userId/campaignId
      // (auto-start recording, opret CALL_RECORDING-aktivitet i lead-historik).
      if (manualClientStateRef.current) {
        callOptions.clientState = manualClientStateRef.current;
      }

      const call = clientRef.current.newCall(callOptions) as TelnyxCall;
      activeCallRef.current = call;
      attachCallStreams(call);
      // Bliv i "connecting" indtil Telnyx fortæller os 180 Ringing er modtaget
      // fra operatøren. telnyx.notification-handleren opgraderer til "ringing"
      // når modtagerens telefon faktisk ringer, og videre til "live" ved svar.
      setLineStatus("connecting");
      setDetail(null);
    } catch (err) {
      const d = describeVoipStartupFailure(err);
      setLineStatus("idle");
      setDetail(null);
      reportVoipFailure(d.userText, d.technical);
      setCallEndAt(Date.now());
      clearCallAudioState(false);
    } finally {
      inFlightRef.current = false;
    }
  }

  async function hangUp() {
    endCallInitiatedByUsRef.current = true;
    try {
      await activeCallRef.current?.hangup?.();
    } catch {
      /* no-op */
    }
    activeCallRef.current = null;
    setLineStatus("idle");
    setDetail(null);
    inFlightRef.current = false;
    clearCallAudioState(true);
  }

  function onRoundButtonClick() {
    if (lineStatus === "ringing" || lineStatus === "live" || lineStatus === "connecting") {
      void hangUp();
      return;
    }
    void startCall();
  }

  useEffect(() => {
    if (hangupSignal === hangupSignalRef.current) return;
    hangupSignalRef.current = hangupSignal;
    if (activeCallRef.current) {
      void (async () => {
        await hangUp();
        onHangupSignalHandled?.();
      })();
      return;
    }
    onHangupSignalHandled?.();
    // we intentionally track only signal/callback; active call state is read from ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hangupSignal, onHangupSignalHandled]);

  useEffect(() => {
    const key = `${leadId}|${normalizeDialDraft(dialDraft)}|${autoStartCall}`;
    if (!autoStartCall) {
      autoKeyRef.current = null;
      return;
    }
    if (!audioSetupReady) return;
    if (autoKeyRef.current === key) return;
    if (!normalizeDialDraft(dialDraft)) return;
    autoKeyRef.current = key;
    void startCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, dialDraft, autoStartCall, audioSetupReady]);

  /**
   * Predictive-mode: hvis vi har ringet i for lang tid (modtageren tager den ikke),
   * lægger vi automatisk på og signalerer workspace om at hente næste lead.
   * Power Dialer er bevidst manuel — agenten styrer selv hvornår der gås videre.
   */
  useEffect(() => {
    if (dialMode !== "PREDICTIVE") return;
    if (!onUnansweredTimeout) return;
    if (!autoStartCall) return;
    if (lineStatus !== "ringing" && lineStatus !== "connecting") return;
    if (unansweredTimeoutMs <= 0) return;
    /* useEffect rydder timeren straks lineStatus skifter til "live"/"idle"/"error",
     * så når callbacket fyrer er vi stadig i "ringing"/"connecting". */
    const timer = window.setTimeout(() => {
      void hangUp();
      onUnansweredTimeout();
    }, unansweredTimeoutMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialMode, lineStatus, autoStartCall, leadId, unansweredTimeoutMs]);

  const timerLabel = formatCallDuration(shownSeconds);
  const timerTone =
    lineStatus === "live"
      ? "text-emerald-700"
      : lineStatus === "ringing" || lineStatus === "connecting"
        ? "text-amber-700"
        : callStartAt
          ? "text-stone-600"
          : "text-stone-400";

  return (
    <section
      className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-white px-4 py-4 shadow-sm"
      aria-label="VoIP opkald"
    >
      <audio ref={remoteAudioRef} id={remoteAudioId} autoPlay playsInline />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/85">
            VoIP opkald
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              lineStatus === "live"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : lineStatus === "ringing" || lineStatus === "connecting"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : lineStatus === "error"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-stone-300 bg-stone-50 text-stone-600"
            }`}
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                lineStatus === "live"
                  ? "bg-emerald-500"
                  : lineStatus === "ringing" || lineStatus === "connecting"
                    ? "bg-amber-500"
                    : lineStatus === "error"
                      ? "bg-red-500"
                      : "bg-stone-400"
              }`}
            />
            {lineStatus === "live"
              ? "I samtale"
              : lineStatus === "ringing"
                ? "Ringer"
                : lineStatus === "connecting"
                  ? "Forbinder"
                  : lineStatus === "error"
                    ? "Fejl"
                    : "Klar"}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition ${
              settingsOpen
                ? "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700"
                : "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
            }`}
            aria-expanded={settingsOpen}
            aria-controls={`voip-audio-settings-${leadId}`}
            title="Åbn lydindstillinger"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Lydindstillinger
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <div
          id={`voip-audio-settings-${leadId}`}
          className="mt-3 rounded-xl border border-emerald-100 bg-white/85 px-3 py-3"
        >
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
            <>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void refreshDevices()}
                  disabled={refreshBusy}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
                  title="Genlæs enhedsliste hvis du lige har koblet headset til"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M21 12a9 9 0 0 1-14.85 6.85L3 16" />
                    <path d="M21 22v-6h-6" />
                    <path d="M3 12a9 9 0 0 1 14.85-6.85L21 8" />
                    <path d="M3 2v6h6" />
                  </svg>
                  {refreshBusy ? "Genlæser…" : "Opdater enhedsliste"}
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={`voip-mic-${leadId}`}
                    className="text-[11px] font-medium text-emerald-900/90"
                  >
                    Mikrofon ({inputDevs.length})
                  </label>
                  <select
                    id={`voip-mic-${leadId}`}
                    value={micId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMicId(v);
                      setManualHeadsetConfirm(false);
                      writeStoredDeviceId(VOIP_STORED_MIC_KEY, v);
                    }}
                    className="mt-1 w-full rounded-md border border-emerald-200/80 bg-white px-2 py-2 text-sm text-stone-900 shadow-sm outline-none ring-emerald-400/40 focus:ring-2"
                  >
                    <option value="">Vælg mikrofon…</option>
                    {inputDevs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Mikrofon (${d.deviceId.slice(0, 8)}…)`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor={`voip-spk-${leadId}`}
                    className="text-[11px] font-medium text-emerald-900/90"
                  >
                    Lydudgang ({outputDevs.length})
                  </label>
                  {outputDevs.length === 0 ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
                      Browseren viser ingen separate lydudgange — tryk «Opdater enhedsliste» eller sæt
                      headset som standard i macOS Lyd.
                    </p>
                  ) : (
                    <select
                      id={`voip-spk-${leadId}`}
                      value={speakerId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSpeakerId(v);
                        setManualHeadsetConfirm(false);
                        writeStoredDeviceId(VOIP_STORED_SPK_KEY, v);
                      }}
                      className="mt-1 w-full rounded-md border border-emerald-200/80 bg-white px-2 py-2 text-sm text-stone-900 shadow-sm outline-none ring-emerald-400/40 focus:ring-2"
                    >
                      <option value="">Vælg hovedtelefoner / headset…</option>
                      {outputDevs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Output (${d.deviceId.slice(0, 8)}…)`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {inputDevs.length > 0 ? (
                  <label className="sm:col-span-2 flex cursor-pointer items-start gap-2 rounded-md border border-stone-200/90 bg-stone-50/80 px-2 py-2 text-[11px] leading-snug text-stone-700">
                    <input
                      type="checkbox"
                      checked={manualHeadsetConfirm}
                      onChange={(e) => setManualHeadsetConfirm(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-stone-400 text-emerald-700 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="font-semibold text-stone-800">Ved tvivl:</span> Jeg bekræfter, at jeg
                      bruger headset med mikrofon.
                    </span>
                  </label>
                ) : null}
              </div>

              {refreshInfo ? (
                <p className="mt-2 text-[11px] font-medium text-stone-700" role="status">
                  {refreshInfo}
                </p>
              ) : null}
              {setupError ? (
                <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                  {setupError}
                </p>
              ) : null}
              {inputDevs.length === 0 ? (
                <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                  Ingen mikrofon fundet. Tilslut headset og tryk «Opdater enhedsliste».
                </p>
              ) : null}
              {needsSpeakerPick ? (
                <p className="mt-2 text-xs font-medium text-amber-900" role="status">
                  Vælg lydudgang.
                </p>
              ) : null}
              {verifyError ? (
                <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                  Mikrofon: {verifyError}
                </p>
              ) : null}
              {headsetBlockReason ? (
                <p
                  className={`mt-2 text-xs font-medium ${manualHeadsetConfirm ? "text-amber-900" : "text-red-700"}`}
                  role="alert"
                >
                  {manualHeadsetConfirm
                    ? `Automatisk tjek: ${headsetBlockReason} — manuel bekræftelse er aktiv.`
                    : headsetBlockReason}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-emerald-100 bg-white/85 px-3 py-3">
        {voipToast ? (
          <div
            className={`mb-2 rounded-lg border border-amber-200/90 bg-amber-50/95 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-sm transition-opacity duration-500 ${
              voipToastFading ? "opacity-0" : "opacity-100"
            }`}
            role="status"
            aria-live="polite"
          >
            {voipToast}
          </div>
        ) : null}
        <label
          htmlFor={`voip-dial-${leadId}`}
          className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900/85"
        >
          Telefonnummer (opkald)
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            id={`voip-dial-${leadId}`}
            type="text"
            inputMode="tel"
            autoComplete="off"
            value={dialDraft}
            onChange={(e) => setDialDraft(e.target.value)}
            placeholder="Nummer til opkald"
            className="min-w-[12rem] flex-1 rounded-md border border-emerald-200/80 bg-white px-3 py-2 font-mono text-sm font-medium tracking-wide text-stone-900 shadow-sm outline-none ring-emerald-400/40 focus:ring-2"
          />

          <div
            className={`inline-flex min-w-[4.5rem] items-center justify-center rounded-md border px-2 py-1 font-mono text-sm font-semibold tabular-nums ${
              lineStatus === "live"
                ? "border-emerald-200 bg-emerald-50"
                : lineStatus === "ringing" || lineStatus === "connecting"
                  ? "border-amber-200 bg-amber-50"
                  : "border-stone-200 bg-stone-50"
            } ${timerTone}`}
            aria-label="Opkaldstid"
            title={callStartAt && !callEndAt ? "Varighed i samtalen" : "Sidste samtales varighed"}
          >
            {timerLabel}
          </div>

          <div className="inline-flex items-center gap-3 rounded-md border border-stone-200 bg-white/80 px-2.5 py-1.5">
            <AudioLevelBar level={outLevel} label="Ud" variant="out" />
            <AudioLevelBar level={activeCall ? inLevel : 0} label="Ind" variant="in" />
          </div>

          <button
            type="button"
            onClick={onRoundButtonClick}
            disabled={!activeCall && !audioSetupReady}
            title={!activeCall && !audioSetupReady ? "Konfigurer headset og mikrofon først" : undefined}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white shadow-md transition ${
              activeCall
                ? "bg-red-600 hover:bg-red-700"
                : canPlaceCall
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "cursor-not-allowed bg-stone-400"
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

        {detail ? (
          <p
            className={`mt-2 text-xs font-medium ${lineStatus === "error" ? "text-red-700" : "text-stone-700"}`}
            role={lineStatus === "error" ? "alert" : "status"}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </section>
  );
}

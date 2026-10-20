"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Let softphone til admin-Medlyt: WebRTC + auto-svar på indgående supervising leg.
 * Mic er muted under monitor; unmute kun når whisper (tal til sælger) er slået til.
 */

type TelnyxCall = {
  id?: string;
  state?: unknown;
  direction?: "outbound" | "inbound";
  hangup?: () => Promise<void> | void;
  muteAudio?: () => void;
  unmuteAudio?: () => void;
  answer?: (options?: {
    audio?: boolean;
    video?: boolean;
    remoteElement?: string | HTMLAudioElement;
  }) => Promise<void> | void;
};

type TelnyxClient = {
  remoteElement?: string;
  connect: () => void;
  disconnect: () => void;
  on: (eventName: string, callback: (...args: unknown[]) => void) => TelnyxClient;
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
    return map[stateRaw] ?? String(stateRaw);
  }
  return "";
}

export type MedlytPhoneState = {
  registered: boolean;
  listening: boolean;
  problem: string | null;
};

type Props = {
  enabled: boolean;
  hangupSignal: number;
  /** Når true: unmute mic (whisper). Ellers muted (monitor). */
  whisperOn: boolean;
  onStateChange: (state: MedlytPhoneState) => void;
};

export function MedlytPhone({ enabled, hangupSignal, whisperOn, onStateChange }: Props) {
  const reactId = useId().replace(/:/g, "");
  const remoteAudioId = `medlyt-remote-${reactId}`;
  const clientRef = useRef<TelnyxClient | null>(null);
  const activeCallRef = useRef<TelnyxCall | null>(null);
  const connectGenerationRef = useRef(0);
  const hangupSeenRef = useRef(hangupSignal);
  const whisperOnRef = useRef(whisperOn);
  const [registered, setRegistered] = useState(false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  whisperOnRef.current = whisperOn;

  useEffect(() => {
    onStateChange({ registered, listening, problem });
  }, [registered, listening, problem, onStateChange]);

  const applyMicMute = useCallback((call: TelnyxCall | null, allowTalk: boolean) => {
    if (!call) return;
    try {
      if (allowTalk) call.unmuteAudio?.();
      else call.muteAudio?.();
    } catch {
      /* no-op */
    }
  }, []);

  const autoAnswer = useCallback(
    (call: TelnyxCall) => {
      try {
        void Promise.resolve(
          call.answer?.({ audio: true, video: false, remoteElement: remoteAudioId }),
        )
          .then(() => {
            // Start muted indtil whisper er slået til.
            applyMicMute(call, whisperOnRef.current);
          })
          .catch(() => {
            void Promise.resolve(call.answer?.({ remoteElement: remoteAudioId }))
              .then(() => applyMicMute(call, whisperOnRef.current))
              .catch(() => {
                setProblem("Kunne ikke besvare medlyt-opkaldet.");
              });
          });
      } catch {
        setProblem("Kunne ikke besvare medlyt-opkaldet.");
      }
    },
    [remoteAudioId, applyMicMute],
  );

  const handleNotification = useCallback(
    (evt?: unknown) => {
      const payload = evt && typeof evt === "object" ? (evt as Record<string, unknown>) : {};
      const call = payload.call && typeof payload.call === "object" ? (payload.call as TelnyxCall) : null;
      if (!call) return;
      const token = stateToken(call.state);
      if (CLOSED_STATES.has(token)) {
        if (activeCallRef.current === call) {
          activeCallRef.current = null;
          setListening(false);
        }
        return;
      }
      if (RINGING_STATES.has(token) || call.direction === "inbound") {
        if (!activeCallRef.current || activeCallRef.current === call) {
          activeCallRef.current = call;
          autoAnswer(call);
        }
      }
      if (LIVE_STATES.has(token)) {
        activeCallRef.current = call;
        setListening(true);
        setProblem(null);
        applyMicMute(call, whisperOnRef.current);
      }
    },
    [autoAnswer, applyMicMute],
  );

  useEffect(() => {
    applyMicMute(activeCallRef.current, whisperOn);
  }, [whisperOn, applyMicMute, listening]);

  const disconnectClient = useCallback(() => {
    const call = activeCallRef.current;
    activeCallRef.current = null;
    if (call) {
      try {
        void call.hangup?.();
      } catch {
        /* no-op */
      }
    }
    const client = clientRef.current;
    clientRef.current = null;
    setRegistered(false);
    setListening(false);
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
    setProblem(null);
    try {
      const res = await fetch("/api/telnyx/webrtc/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voipApiContext: "medlyt_session" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        loginToken?: string;
        error?: string;
      };
      if (!res.ok || !json.loginToken) {
        throw new Error(json.error || `Kunne ikke hente WebRTC-token (HTTP ${res.status}).`);
      }
      const mod = await import("@telnyx/webrtc");
      if (generation !== connectGenerationRef.current) return;
      const TelnyxRTC = mod.TelnyxRTC as unknown as new (options: {
        login_token?: string;
        region?: string;
      }) => TelnyxClient;
      const client = new TelnyxRTC({ login_token: json.loginToken, region: "eu" });
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
          setProblem(null);
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
          const msg =
            typeof p.message === "string" ? p.message : "Forbindelsen til telefonsystemet blev afbrudt.";
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(msg));
            return;
          }
          setProblem(msg);
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
      setProblem(err instanceof Error ? err.message : "Kunne ikke forbinde.");
    }
  }, [remoteAudioId, handleNotification, disconnectClient]);

  useEffect(() => {
    if (!enabled) {
      connectGenerationRef.current += 1;
      disconnectClient();
      return;
    }
    void connect();
    return () => {
      connectGenerationRef.current += 1;
      disconnectClient();
    };
  }, [enabled, connect, disconnectClient]);

  useEffect(() => {
    if (hangupSignal === hangupSeenRef.current) return;
    hangupSeenRef.current = hangupSignal;
    const call = activeCallRef.current;
    if (!call) return;
    try {
      void call.hangup?.();
    } catch {
      /* no-op */
    }
    activeCallRef.current = null;
    setListening(false);
  }, [hangupSignal]);

  return (
    <audio id={remoteAudioId} autoPlay playsInline style={{ display: "none" }} />
  );
}

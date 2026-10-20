"use client";

/**
 * Admin: start browser-Medlyt — opret session, send offer, afspil sælgerens blandede lyd.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createMedlytPeerConnection } from "@/lib/medlyt-webrtc";
import { iceCandidatesFromJson } from "@/lib/medlyt-listen-client";

export type MedlytListenerState = {
  sessionId: string | null;
  listening: boolean;
  negotiating: boolean;
  problem: string | null;
};

type Props = {
  targetUserId: string | null;
  /** Når true: stop aktiv session. */
  stopSignal: number;
  onStateChange: (state: MedlytListenerState) => void;
};

export function MedlytListener({ targetUserId, stopSignal, onStateChange }: Props) {
  const reactId = useId().replace(/:/g, "");
  const audioId = `medlyt-listen-audio-${reactId}`;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const appliedSellerIceRef = useRef(0);
  const stopSeenRef = useRef(stopSignal);
  const pollIntervalRef = useRef<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [negotiating, setNegotiating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    onStateChange({ sessionId, listening, negotiating, problem });
  }, [sessionId, listening, negotiating, problem, onStateChange]);

  const clearPoll = () => {
    if (pollIntervalRef.current != null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const cleanup = useCallback(async (endRemote: boolean) => {
    clearPoll();
    const sid = sessionIdRef.current;
    sessionIdRef.current = null;
    setSessionId(null);
    setListening(false);
    setNegotiating(false);
    appliedSellerIceRef.current = 0;
    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      try {
        pc.close();
      } catch {
        /* no-op */
      }
    }
    const el = document.getElementById(audioId) as HTMLAudioElement | null;
    if (el) el.srcObject = null;
    if (endRemote && sid) {
      await fetch(`/api/dialer/medlyt/listen/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
      }).catch(() => undefined);
    }
  }, [audioId]);

  useEffect(() => {
    if (stopSignal === stopSeenRef.current) return;
    stopSeenRef.current = stopSignal;
    void cleanup(true);
  }, [stopSignal, cleanup]);

  useEffect(() => {
    if (!targetUserId) {
      void cleanup(true);
      return;
    }

    let cancelled = false;

    const postIce = async (sid: string, candidate: RTCIceCandidate) => {
      const init = candidate.toJSON();
      if (!init.candidate) return;
      await fetch(`/api/dialer/medlyt/listen/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin", ice: init }),
      }).catch(() => undefined);
    };

    const start = async () => {
      setProblem(null);
      setNegotiating(true);
      setListening(false);

      const createRes = await fetch("/api/dialer/medlyt/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const createData = (await createRes.json().catch(() => ({}))) as {
        sessionId?: string;
        error?: string;
      };
      if (!createRes.ok || !createData.sessionId) {
        if (!cancelled) {
          setProblem(createData.error || "Kunne ikke starte medlyt.");
          setNegotiating(false);
        }
        return;
      }
      if (cancelled) {
        await fetch(`/api/dialer/medlyt/listen/${createData.sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ end: true }),
        }).catch(() => undefined);
        return;
      }

      const sid = createData.sessionId;
      sessionIdRef.current = sid;
      setSessionId(sid);

      const pc = createMedlytPeerConnection();
      pcRef.current = pc;
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void postIce(sid, ev.candidate);
      };
      pc.ontrack = (ev) => {
        const el = document.getElementById(audioId) as HTMLAudioElement | null;
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        if (el) {
          el.srcObject = stream;
          void el.play().catch(() => undefined);
        }
        setListening(true);
        setNegotiating(false);
        setProblem(null);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setListening(true);
          setNegotiating(false);
        }
        if (pc.connectionState === "failed") {
          setProblem("Forbindelsen til sælgeren fejlede. Prøv igen.");
          setNegotiating(false);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const offerRes = await fetch(`/api/dialer/medlyt/listen/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerSdp: offer.sdp }),
      });
      if (!offerRes.ok) {
        const err = (await offerRes.json().catch(() => ({}))) as { error?: string };
        if (!cancelled) {
          setProblem(err.error || "Kunne ikke sende offer.");
          setNegotiating(false);
        }
        return;
      }

      const poll = async () => {
        if (cancelled || sessionIdRef.current !== sid) return;
        try {
          const res = await fetch(`/api/dialer/medlyt/listen/${sid}`);
          const data = (await res.json().catch(() => ({}))) as {
            session?: {
              status: string;
              answerSdp: string | null;
              sellerIceJson: string | null;
            };
          };
          if (!res.ok || !data.session) return;
          if (data.session.status === "ended") {
            setProblem("Medlyt blev afbrudt.");
            setListening(false);
            setNegotiating(false);
            clearPoll();
            return;
          }
          const remotePc = pcRef.current;
          if (!remotePc) return;

          if (data.session.answerSdp && !remotePc.currentRemoteDescription) {
            await remotePc.setRemoteDescription({
              type: "answer",
              sdp: data.session.answerSdp,
            });
          }

          const cands = iceCandidatesFromJson(data.session.sellerIceJson);
          for (let i = appliedSellerIceRef.current; i < cands.length; i++) {
            try {
              await remotePc.addIceCandidate(cands[i] as RTCIceCandidateInit);
            } catch {
              /* ignore */
            }
          }
          appliedSellerIceRef.current = cands.length;
        } catch {
          /* retry */
        }
      };

      void poll();
      pollIntervalRef.current = window.setInterval(() => void poll(), 800);
    };

    void start();

    return () => {
      cancelled = true;
      void cleanup(true);
    };
  }, [targetUserId, audioId, cleanup]);

  return <audio id={audioId} autoPlay playsInline style={{ display: "none" }} />;
}

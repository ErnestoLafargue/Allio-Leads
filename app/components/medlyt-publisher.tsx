"use client";

/**
 * Kører i sælgerens dialer: poller efter admin-Medlyt, svarer med blandet mic+remote via WebRTC.
 */

import { useEffect, useRef } from "react";
import { createMedlytMix, type MedlytMixHandle } from "@/lib/medlyt-mix-audio";
import { createMedlytPeerConnection } from "@/lib/medlyt-webrtc";
import { iceCandidatesFromJson } from "@/lib/medlyt-listen-client";

type Props = {
  /** Persistent mic (åben mens dialeren er klar). */
  micStream: MediaStream | null;
  /** Telnyx remote (kunde) — null når der ikke er opkald. */
  remoteStream: MediaStream | null;
  enabled?: boolean;
};

type PendingSession = {
  id: string;
  status: string;
  offerSdp: string | null;
  adminIceJson: string | null;
};

export function MedlytPublisher({ micStream, remoteStream, enabled = true }: Props) {
  const micRef = useRef(micStream);
  const remoteRef = useRef(remoteStream);
  micRef.current = micStream;
  remoteRef.current = remoteStream;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mixRef = useRef<MedlytMixHandle | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const answeredRef = useRef(false);
  const appliedAdminIceRef = useRef(0);
  const senderRef = useRef<RTCRtpSender | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const cleanupPc = () => {
      const pc = pcRef.current;
      pcRef.current = null;
      senderRef.current = null;
      answeredRef.current = false;
      appliedAdminIceRef.current = 0;
      if (pc) {
        try {
          pc.close();
        } catch {
          /* no-op */
        }
      }
      const mix = mixRef.current;
      mixRef.current = null;
      mix?.destroy();
      sessionIdRef.current = null;
    };

    const ensureMix = () => {
      if (!mixRef.current) mixRef.current = createMedlytMix();
      mixRef.current.update(micRef.current, remoteRef.current);
      return mixRef.current;
    };

    const postIce = async (sessionId: string, candidate: RTCIceCandidate) => {
      const init = candidate.toJSON();
      if (!init.candidate) return;
      await fetch(`/api/dialer/medlyt/listen/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "seller", ice: init }),
      }).catch(() => undefined);
    };

    const answerSession = async (s: PendingSession) => {
      if (!s.offerSdp || answeredRef.current) return;
      if (sessionIdRef.current && sessionIdRef.current !== s.id) cleanupPc();

      sessionIdRef.current = s.id;
      const mix = ensureMix();
      const track = mix.stream.getAudioTracks()[0];
      // #region agent log
      fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
        body: JSON.stringify({
          sessionId: "c1392e",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "app/components/medlyt-publisher.tsx:answerSession",
          message: "seller answering listen",
          data: {
            listenId: s.id,
            hasOffer: Boolean(s.offerSdp),
            hasTrack: Boolean(track),
            micTracks: micRef.current?.getAudioTracks().length ?? 0,
            remoteTracks: remoteRef.current?.getAudioTracks().length ?? 0,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (!track) return;

      const pc = createMedlytPeerConnection();
      pcRef.current = pc;
      pc.onicecandidate = (ev) => {
        if (ev.candidate && sessionIdRef.current) {
          void postIce(sessionIdRef.current, ev.candidate);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          if (sessionIdRef.current === s.id) cleanupPc();
        }
      };

      const sender = pc.addTrack(track, mix.stream);
      senderRef.current = sender;

      await pc.setRemoteDescription({ type: "offer", sdp: s.offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      answeredRef.current = true;

      const res = await fetch(`/api/dialer/medlyt/listen/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerSdp: answer.sdp }),
      });
      if (!res.ok) {
        cleanupPc();
      }
    };

    const applyAdminIce = async (sessionId: string, adminIceJson: string | null) => {
      const pc = pcRef.current;
      if (!pc || sessionIdRef.current !== sessionId) return;
      const cands = iceCandidatesFromJson(adminIceJson);
      for (let i = appliedAdminIceRef.current; i < cands.length; i++) {
        try {
          await pc.addIceCandidate(cands[i] as RTCIceCandidateInit);
        } catch {
          /* ignore stale */
        }
      }
      appliedAdminIceRef.current = cands.length;
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        // Hold mix syncet med mic/remote (replaceTrack hvis spor skifter).
        if (mixRef.current && pcRef.current) {
          mixRef.current.update(micRef.current, remoteRef.current);
          const t = mixRef.current.stream.getAudioTracks()[0];
          const sender = senderRef.current;
          if (t && sender && sender.track?.id !== t.id) {
            await sender.replaceTrack(t).catch(() => undefined);
          }
        }

        const res = await fetch("/api/dialer/medlyt/listen/pending");
        const data = (await res.json().catch(() => ({}))) as {
          sessions?: PendingSession[];
        };
        if (!res.ok || cancelled) return;
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const active = sessions.find((x) => x.offerSdp) ?? sessions[0] ?? null;

        if (!active) {
          if (sessionIdRef.current) cleanupPc();
          return;
        }

        if (active.status === "ended") {
          cleanupPc();
          return;
        }

        if (!answeredRef.current || sessionIdRef.current !== active.id) {
          await answerSession(active);
        }
        await applyAdminIce(active.id, active.adminIceJson);
      } catch {
        /* netværk — prøv igen */
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 1200);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanupPc();
    };
  }, [enabled]);

  // Opdater mix når streams skifter (uden at genstarte PC).
  useEffect(() => {
    if (!mixRef.current) return;
    mixRef.current.update(micStream, remoteStream);
    const t = mixRef.current.stream.getAudioTracks()[0];
    const sender = senderRef.current;
    if (t && sender) {
      void sender.replaceTrack(t).catch(() => undefined);
    }
  }, [micStream, remoteStream]);

  return null;
}

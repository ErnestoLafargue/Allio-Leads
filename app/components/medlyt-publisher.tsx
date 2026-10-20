"use client";

/**
 * Sælger-dialer: svarer på admin-Medlyt.
 * Spor: [0] mic → admin, [1] admin → sælger, [2] Telnyx-remote → admin.
 */

import { useEffect, useId, useRef } from "react";
import {
  attachMedlytPlayback,
  createMedlytPeerConnection,
  liveAudioTrack,
  normalizeMedlytSdp,
  preferMedlytOpus,
  waitForIceGathering,
} from "@/lib/medlyt-webrtc";
import { iceCandidatesFromJson } from "@/lib/medlyt-listen-client";

type Props = {
  micStream: MediaStream | null;
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
  const reactId = useId().replace(/:/g, "");
  const coachAudioId = `medlyt-coach-${reactId}`;
  const micRef = useRef(micStream);
  const remoteRef = useRef(remoteStream);
  micRef.current = micStream;
  remoteRef.current = remoteStream;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const answeredRef = useRef(false);
  const appliedAdminIceRef = useRef(0);
  const micSenderRef = useRef<RTCRtpSender | null>(null);
  const remoteSenderRef = useRef<RTCRtpSender | null>(null);
  const answeringRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const cleanupPc = () => {
      const pc = pcRef.current;
      pcRef.current = null;
      micSenderRef.current = null;
      remoteSenderRef.current = null;
      answeredRef.current = false;
      answeringRef.current = false;
      appliedAdminIceRef.current = 0;
      if (pc) {
        try {
          pc.close();
        } catch {
          /* no-op */
        }
      }
      sessionIdRef.current = null;
      const el = document.getElementById(coachAudioId) as HTMLAudioElement | null;
      if (el) el.srcObject = null;
    };

    const syncTracks = async () => {
      const mic = liveAudioTrack(micRef.current);
      const remote = liveAudioTrack(remoteRef.current);
      if (micSenderRef.current && micSenderRef.current.track?.id !== mic?.id) {
        await micSenderRef.current.replaceTrack(mic).catch(() => undefined);
      }
      if (remoteSenderRef.current && remoteSenderRef.current.track?.id !== remote?.id) {
        await remoteSenderRef.current.replaceTrack(remote).catch(() => undefined);
      }
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
      if (!s.offerSdp || answeringRef.current) return;
      if (answeredRef.current && sessionIdRef.current === s.id) return;
      if (sessionIdRef.current && sessionIdRef.current !== s.id) cleanupPc();

      const mic = liveAudioTrack(micRef.current);
      if (!mic) return;

      answeringRef.current = true;
      sessionIdRef.current = s.id;
      try {
        const pc = createMedlytPeerConnection();
        pcRef.current = pc;
        pc.onicecandidate = (ev) => {
          if (ev.candidate && sessionIdRef.current) {
            void postIce(sessionIdRef.current, ev.candidate);
          }
        };
        pc.ontrack = (ev) => {
          if (ev.track.kind !== "audio") return;
          const el = document.getElementById(coachAudioId) as HTMLAudioElement | null;
          attachMedlytPlayback(el, ev.track);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            if (sessionIdRef.current === s.id) cleanupPc();
          }
        };

        await pc.setRemoteDescription({ type: "offer", sdp: normalizeMedlytSdp(s.offerSdp) });
        preferMedlytOpus(pc);

        const senders = pc
          .getTransceivers()
          .filter((t) => t.direction !== "recvonly")
          .map((t) => t.sender);
        micSenderRef.current = senders[0] ?? null;
        remoteSenderRef.current = senders[1] ?? senders[0] ?? null;
        if (micSenderRef.current) {
          await micSenderRef.current.replaceTrack(mic);
        }
        const remote = liveAudioTrack(remoteRef.current);
        if (remoteSenderRef.current && remoteSenderRef.current !== micSenderRef.current) {
          await remoteSenderRef.current.replaceTrack(remote);
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const iceMs = await waitForIceGathering(pc);
        const sdp = normalizeMedlytSdp(pc.localDescription?.sdp || answer.sdp || "");
        // #region agent log
        fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
          body: JSON.stringify({
            sessionId: "c1392e",
            hypothesisId: "H-connect",
            location: "medlyt-publisher.tsx:answer",
            message: "seller answer ready",
            data: {
              senders: senders.length,
              hasRemote: Boolean(remote),
              iceMs,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion

        const res = await fetch(`/api/dialer/medlyt/listen/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answerSdp: sdp }),
        });
        if (!res.ok) {
          cleanupPc();
          return;
        }
        answeredRef.current = true;
      } catch {
        cleanupPc();
      } finally {
        answeringRef.current = false;
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
        if (pcRef.current) await syncTracks();
        const res = await fetch("/api/dialer/medlyt/listen/pending");
        const data = (await res.json().catch(() => ({}))) as {
          sessions?: PendingSession[];
        };
        if (!res.ok || cancelled) return;
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const active = sessions.find((x) => x.offerSdp) ?? sessions[0] ?? null;
        if (!active || active.status === "ended") {
          if (sessionIdRef.current) cleanupPc();
          return;
        }
        if (!answeredRef.current || sessionIdRef.current !== active.id) {
          await answerSession(active);
        }
        await applyAdminIce(active.id, active.adminIceJson);
      } catch {
        /* retry */
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 250);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanupPc();
    };
  }, [enabled, coachAudioId]);

  useEffect(() => {
    const mic = liveAudioTrack(micStream);
    const remote = liveAudioTrack(remoteStream);
    if (micSenderRef.current) void micSenderRef.current.replaceTrack(mic).catch(() => undefined);
    if (remoteSenderRef.current && remoteSenderRef.current !== micSenderRef.current) {
      void remoteSenderRef.current.replaceTrack(remote).catch(() => undefined);
    }
  }, [micStream, remoteStream]);

  return <audio id={coachAudioId} autoPlay playsInline style={{ display: "none" }} />;
}

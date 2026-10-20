"use client";

/**
 * Kører i sælgerens dialer: sender mic (og Telnyx-remote når der er opkald)
 * direkte som WebRTC-spor — uden AudioContext-mix, så delay bliver lavere.
 */

import { useEffect, useRef } from "react";
import {
  createMedlytPeerConnection,
  liveAudioTrack,
  normalizeMedlytSdp,
  preferMedlytOpus,
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

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const cleanupPc = () => {
      const pc = pcRef.current;
      pcRef.current = null;
      micSenderRef.current = null;
      remoteSenderRef.current = null;
      answeredRef.current = false;
      appliedAdminIceRef.current = 0;
      if (pc) {
        try {
          pc.close();
        } catch {
          /* no-op */
        }
      }
      sessionIdRef.current = null;
    };

    const syncTracks = async () => {
      const micSender = micSenderRef.current;
      const remoteSender = remoteSenderRef.current;
      const mic = liveAudioTrack(micRef.current);
      const remote = liveAudioTrack(remoteRef.current);
      if (micSender && micSender.track?.id !== mic?.id) {
        await micSender.replaceTrack(mic).catch(() => undefined);
      }
      if (remoteSender && remoteSender.track?.id !== remote?.id) {
        await remoteSender.replaceTrack(remote).catch(() => undefined);
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
      if (!s.offerSdp) return;
      if (sessionIdRef.current && sessionIdRef.current !== s.id) cleanupPc();
      if (answeredRef.current && sessionIdRef.current === s.id) return;

      const mic = liveAudioTrack(micRef.current);
      if (!mic || !micRef.current) return;

      sessionIdRef.current = s.id;
      const pc = createMedlytPeerConnection();
      pcRef.current = pc;
      preferMedlytOpus(pc);
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

      micSenderRef.current = pc.addTrack(mic, micRef.current);
      const remote = liveAudioTrack(remoteRef.current);
      if (remote && remoteRef.current) {
        remoteSenderRef.current = pc.addTrack(remote, remoteRef.current);
      } else {
        remoteSenderRef.current = pc.addTransceiver("audio", { direction: "sendonly" }).sender;
      }

      await pc.setRemoteDescription({ type: "offer", sdp: normalizeMedlytSdp(s.offerSdp) });
      preferMedlytOpus(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      answeredRef.current = true;

      const res = await fetch(`/api/dialer/medlyt/listen/${s.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerSdp: answer.sdp }),
      });
      if (!res.ok) cleanupPc();
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
        /* prøv igen */
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      cleanupPc();
    };
  }, [enabled]);

  useEffect(() => {
    const micSender = micSenderRef.current;
    const remoteSender = remoteSenderRef.current;
    const mic = liveAudioTrack(micStream);
    const remote = liveAudioTrack(remoteStream);
    if (micSender) void micSender.replaceTrack(mic).catch(() => undefined);
    if (remoteSender) void remoteSender.replaceTrack(remote).catch(() => undefined);
  }, [micStream, remoteStream]);

  return null;
}

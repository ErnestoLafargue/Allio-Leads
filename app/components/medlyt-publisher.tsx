"use client";

/**
 * Sælger-dialer: svarer på admin-Medlyt.
 * Spor: [0] mic → admin, [1] admin → sælger, [2] Telnyx-remote → admin.
 */

import { useEffect, useId, useRef } from "react";
import {
  applyMedlytLowDelay,
  applyMedlytLowDelaySdp,
  applyMedlytSendLowDelay,
  applyMedlytSpeechHint,
  attachMedlytPlayback,
  createMedlytPeerConnection,
  createSilentAudioTrack,
  detachMedlytPlayback,
  liveAudioTrack,
  MEDLYT_TALK_AUDIO_CONSTRAINTS,
  normalizeMedlytSdp,
  preferMedlytOpus,
  waitForIceGathering,
} from "@/lib/medlyt-webrtc";
import { iceCandidatesFromJson, postMedlytClientDebug } from "@/lib/medlyt-listen-client";
import { readStoredDeviceId, VOIP_STORED_SPK_KEY } from "@/lib/voip-audio-devices";

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
  const silentRef = useRef<{ stop: () => void } | null>(null);
  const answeringRef = useRef(false);
  const fastMicRef = useRef<MediaStreamTrack | null>(null);

  const micForAdmin = () => fastMicRef.current ?? liveAudioTrack(micRef.current);

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
      silentRef.current?.stop();
      silentRef.current = null;
      detachMedlytPlayback(document.getElementById(coachAudioId) as HTMLAudioElement | null);
    };

    const syncTracks = async () => {
      const mic = micForAdmin();
      const remote = liveAudioTrack(remoteRef.current);
      if (micSenderRef.current && micSenderRef.current.track?.id !== mic?.id) {
        applyMedlytSpeechHint(mic);
        await micSenderRef.current.replaceTrack(mic).catch(() => undefined);
      }
      if (remoteSenderRef.current && remoteSenderRef.current.track?.id !== remote?.id) {
        await remoteSenderRef.current.replaceTrack(remote).catch(() => undefined);
        if (remote) {
          silentRef.current?.stop();
          silentRef.current = null;
        }
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

      const mic = micForAdmin();
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
          applyMedlytLowDelay(ev.receiver);
          const el = document.getElementById(coachAudioId) as HTMLAudioElement | null;
          attachMedlytPlayback(el, ev.track, readStoredDeviceId(VOIP_STORED_SPK_KEY), s.id);
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            if (sessionIdRef.current === s.id) cleanupPc();
          }
        };

        await pc.setRemoteDescription({ type: "offer", sdp: normalizeMedlytSdp(s.offerSdp) });
        preferMedlytOpus(pc);

        // Offer-mids: 0 = sælger-mic, 1 = admin-talk (recv), 2 = Telnyx-remote.
        // `transceiver.direction` spejler stadig offeret (recvonly) her — bind på mid.
        const txs = pc.getTransceivers();
        const byMid = new Map(txs.map((t) => [t.mid, t]));
        const micTx = byMid.get("0") ?? txs[0];
        const remoteTx = byMid.get("2") ?? txs[2];
        micSenderRef.current = micTx?.sender ?? null;
        remoteSenderRef.current =
          remoteTx && remoteTx !== micTx ? remoteTx.sender : null;
        if (micTx) {
          try {
            micTx.direction = "sendonly";
          } catch {
            /* no-op */
          }
          applyMedlytSpeechHint(mic);
          await micTx.sender.replaceTrack(mic);
          applyMedlytSendLowDelay(micTx.sender);
        }
        const remote = liveAudioTrack(remoteRef.current);
        if (remoteTx && remoteTx !== micTx) {
          try {
            remoteTx.direction = "sendonly";
          } catch {
            /* no-op */
          }
          if (remote) {
            await remoteTx.sender.replaceTrack(remote);
          } else {
            silentRef.current?.stop();
            const silent = createSilentAudioTrack();
            silentRef.current = silent;
            await remoteTx.sender.replaceTrack(silent.track);
          }
        }

        const answer = await pc.createAnswer();
        const answerSdp = applyMedlytLowDelaySdp(answer.sdp || "");
        await pc.setLocalDescription({ type: "answer", sdp: answerSdp });
        if (micSenderRef.current) applyMedlytSendLowDelay(micSenderRef.current);
        if (remoteSenderRef.current) applyMedlytSendLowDelay(remoteSenderRef.current);
        await waitForIceGathering(pc);
        const sdp = applyMedlytLowDelaySdp(pc.localDescription?.sdp || answerSdp);

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
        // #region agent log
        postMedlytClientDebug(s.id, {
          hypothesisId: "H-send",
          location: "medlyt-publisher.tsx:answer",
          message: "seller answered",
          data: {
            hasFastMic: Boolean(fastMicRef.current),
            micLive: mic.readyState,
            remoteLive: liveAudioTrack(remoteRef.current)?.readyState ?? null,
            micSender: Boolean(micSenderRef.current?.track),
            remoteSender: Boolean(remoteSenderRef.current?.track),
          },
        });
        // #endregion
      } catch (err) {
        // #region agent log
        postMedlytClientDebug(s.id, {
          hypothesisId: "H-sdp",
          location: "medlyt-publisher.tsx:answer-fail",
          message: "seller answer failed",
          data: { err: err instanceof Error ? err.message : String(err) },
        });
        // #endregion
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
    const mic = micForAdmin();
    const remote = liveAudioTrack(remoteStream);
    if (micSenderRef.current) {
      applyMedlytSpeechHint(mic);
      void micSenderRef.current.replaceTrack(mic).catch(() => undefined);
    }
    if (remoteSenderRef.current && remoteSenderRef.current !== micSenderRef.current) {
      void remoteSenderRef.current.replaceTrack(remote).catch(() => undefined);
      if (remote) {
        silentRef.current?.stop();
        silentRef.current = null;
      }
    }
  }, [micStream, remoteStream]);

  useEffect(() => {
    if (!enabled || !micStream) return;
    const deviceId = liveAudioTrack(micStream)?.getSettings().deviceId ?? null;
    let cancelled = false;
    let opened: MediaStream | null = null;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...MEDLYT_TALK_AUDIO_CONSTRAINTS,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        opened = stream;
        const track = liveAudioTrack(stream);
        if (!track) return;
        applyMedlytSpeechHint(track);
        try {
          await track.applyConstraints(MEDLYT_TALK_AUDIO_CONSTRAINTS);
        } catch {
          /* nogle headsets ignorerer latency */
        }
        fastMicRef.current = track;
        if (micSenderRef.current) {
          await micSenderRef.current.replaceTrack(track).catch(() => undefined);
        }
        // #region agent log
        postMedlytClientDebug(sessionIdRef.current, {
          hypothesisId: "H-fast",
          location: "medlyt-publisher.tsx:fast-mic",
          message: "fast mic ready",
          data: { live: track.readyState, device: track.getSettings().deviceId ? "set" : "none" },
        });
        // #endregion
      } catch {
        fastMicRef.current = null;
        // #region agent log
        postMedlytClientDebug(sessionIdRef.current, {
          hypothesisId: "H-fast",
          location: "medlyt-publisher.tsx:fast-mic-fail",
          message: "fast mic failed",
          data: { fallback: Boolean(liveAudioTrack(micRef.current)) },
        });
        // #endregion
      }
    })();

    return () => {
      cancelled = true;
      opened?.getTracks().forEach((t) => t.stop());
      fastMicRef.current = null;
    };
  }, [enabled, micStream]);

  return <audio id={coachAudioId} autoPlay playsInline style={{ display: "none" }} />;
}

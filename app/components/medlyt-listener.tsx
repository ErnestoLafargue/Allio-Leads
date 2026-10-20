"use client";

/**
 * Admin Medlyt: [0] hør sælger-mic, [1] tal til sælger, [2] hør Telnyx/kunde.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  applyMedlytLowDelay,
  applyMedlytLowDelaySdp,
  applyMedlytSendLowDelay,
  applyMedlytSpeechHint,
  attachMedlytPlayback,
  createMedlytPeerConnection,
  detachMedlytPlayback,
  liveAudioTrack,
  MEDLYT_TALK_AUDIO_CONSTRAINTS,
  normalizeMedlytSdp,
  preferMedlytOpus,
  waitForIceGathering,
} from "@/lib/medlyt-webrtc";
import { iceCandidatesFromJson, postMedlytClientDebug } from "@/lib/medlyt-listen-client";

export type MedlytListenerState = {
  sessionId: string | null;
  listening: boolean;
  negotiating: boolean;
  problem: string | null;
  talkReady: boolean;
};

type Props = {
  targetUserId: string | null;
  stopSignal: number;
  /** true = send admin-mic til sælger. */
  talkOn: boolean;
  onStateChange: (state: MedlytListenerState) => void;
};

export function MedlytListener({ targetUserId, stopSignal, talkOn, onStateChange }: Props) {
  const reactId = useId().replace(/:/g, "");
  const audioSellerId = `medlyt-seller-${reactId}`;
  const audioCustId = `medlyt-cust-${reactId}`;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const talkSenderRef = useRef<RTCRtpSender | null>(null);
  const talkTrackRef = useRef<MediaStreamTrack | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const appliedSellerIceRef = useRef(0);
  const stopSeenRef = useRef(stopSignal);
  const pollIntervalRef = useRef<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [negotiating, setNegotiating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [talkReady, setTalkReady] = useState(false);

  useEffect(() => {
    onStateChange({ sessionId, listening, negotiating, problem, talkReady });
  }, [sessionId, listening, negotiating, problem, talkReady, onStateChange]);

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
    setTalkReady(false);
    appliedSellerIceRef.current = 0;
    const pc = pcRef.current;
    pcRef.current = null;
    talkSenderRef.current = null;
    const talk = talkTrackRef.current;
    talkTrackRef.current = null;
    if (talk) {
      try {
        talk.stop();
      } catch {
        /* no-op */
      }
    }
    if (pc) {
      try {
        pc.close();
      } catch {
        /* no-op */
      }
    }
    const elA = document.getElementById(audioSellerId) as HTMLAudioElement | null;
    const elB = document.getElementById(audioCustId) as HTMLAudioElement | null;
    detachMedlytPlayback(elA);
    detachMedlytPlayback(elB);
    if (endRemote && sid) {
      await fetch(`/api/dialer/medlyt/listen/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
      }).catch(() => undefined);
    }
  }, [audioSellerId, audioCustId]);

  useEffect(() => {
    if (stopSignal === stopSeenRef.current) return;
    stopSeenRef.current = stopSignal;
    void cleanup(true);
  }, [stopSignal, cleanup]);

  useEffect(() => {
    const sender = talkSenderRef.current;
    const track = talkTrackRef.current;
    if (!track) return;
    track.enabled = talkOn;
    if (sender && sender.track !== track) {
      void sender.replaceTrack(talkOn ? track : null).catch(() => undefined);
    }
  }, [talkOn, talkReady]);

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
      setTalkReady(false);

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

      let talkTrack: MediaStreamTrack | null = null;
      try {
        const talkStream = await navigator.mediaDevices.getUserMedia({
          audio: MEDLYT_TALK_AUDIO_CONSTRAINTS,
        });
        talkTrack = liveAudioTrack(talkStream);
        applyMedlytSpeechHint(talkTrack);
      } catch {
        if (!cancelled) {
          setProblem("Tillad mikrofon for at tale til sælger — lyt virker stadig.");
        }
      }
      if (cancelled) {
        talkTrack?.stop();
        return;
      }
      if (talkTrack) {
        talkTrack.enabled = false;
        talkTrackRef.current = talkTrack;
        setTalkReady(true);
      }

      const pc = createMedlytPeerConnection();
      pcRef.current = pc;
      pc.addTransceiver("audio", { direction: "recvonly" });
      const talkTx = pc.addTransceiver("audio", { direction: "sendonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      if (talkTrack) {
        await talkTx.sender.replaceTrack(talkTrack);
        talkSenderRef.current = talkTx.sender;
        applyMedlytSendLowDelay(talkTx.sender);
      }
      preferMedlytOpus(pc);
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void postIce(sid, ev.candidate);
      };
      let inbound = 0;
      pc.ontrack = (ev) => {
        if (ev.track.kind !== "audio") return;
        applyMedlytLowDelay(ev.receiver);
        const elA = document.getElementById(audioSellerId) as HTMLAudioElement | null;
        const elB = document.getElementById(audioCustId) as HTMLAudioElement | null;
        const el = inbound === 0 ? elA : elB;
        inbound += 1;
        attachMedlytPlayback(el, ev.track, null, sid);
        setListening(true);
        setNegotiating(false);
        setProblem(null);
        // #region agent log
        postMedlytClientDebug(sid, {
          hypothesisId: "H-track",
          location: "medlyt-listener.tsx:ontrack",
          message: "admin ontrack",
          data: {
            inbound,
            hasEl: Boolean(el),
            trackMuted: ev.track.muted,
            readyState: ev.track.readyState,
            conn: pc.connectionState,
          },
        });
        // #endregion
      };
      pc.onconnectionstatechange = () => {
        // #region agent log
        postMedlytClientDebug(sid, {
          hypothesisId: "H-track",
          location: "medlyt-listener.tsx:conn",
          message: "admin pc state",
          data: { conn: pc.connectionState, ice: pc.iceConnectionState, inbound },
        });
        // #endregion
        if (pc.connectionState === "connected") {
          for (const r of pc.getReceivers()) {
            if (r.track?.kind === "audio") applyMedlytLowDelay(r);
          }
          setListening(true);
          setNegotiating(false);
        }
        if (pc.connectionState === "failed") {
          setProblem("Forbindelsen til sælgeren fejlede. Prøv igen.");
          setNegotiating(false);
        }
      };

      const offer = await pc.createOffer();
      const offerSdp = applyMedlytLowDelaySdp(offer.sdp || "");
      await pc.setLocalDescription({ type: "offer", sdp: offerSdp });
      if (talkSenderRef.current) applyMedlytSendLowDelay(talkSenderRef.current);
      await waitForIceGathering(pc);
      const sdp = applyMedlytLowDelaySdp(pc.localDescription?.sdp || offerSdp);
      const offerRes = await fetch(`/api/dialer/medlyt/listen/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerSdp: sdp }),
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
              sdp: normalizeMedlytSdp(data.session.answerSdp),
            });
            for (const r of remotePc.getReceivers()) {
              if (r.track?.kind === "audio") applyMedlytLowDelay(r);
            }
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
      pollIntervalRef.current = window.setInterval(() => void poll(), 250);
    };

    void start();

    return () => {
      cancelled = true;
      void cleanup(true);
    };
    // talkOn læses kun ved start til initial enabled; mute styres af effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId, audioSellerId, audioCustId, cleanup]);

  return (
    <>
      <audio id={audioSellerId} autoPlay playsInline style={{ display: "none" }} />
      <audio id={audioCustId} autoPlay playsInline style={{ display: "none" }} />
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { medlytSellerCaptureConstraints } from "@/lib/medlyt-webrtc";

/** Antal mislykkede genåbninger i træk, før vi venter på næste devicechange. */
const MAX_REOPEN_FAILURES = 10;
const REOPEN_RETRY_MS = 3000;

/** true når streamen har et lydspor, der stadig er åbent. */
export function isLiveMicStream(stream: MediaStream | null | undefined): stream is MediaStream {
  const track = stream?.getAudioTracks()[0];
  return !!track && track.readyState === "live";
}

/**
 * Mikrofon-stream der holdes åben hele sessionen (niveau-måling + localStream på opkald)
 * og genåbnes af sig selv, hvis sporet dør.
 *
 * Bluetooth-headsets kobler kortvarigt fra og til, fx når de skifter lydprofil, mens der
 * afspilles en lydfil. Så ender mikrofon-sporet, og uden genåbning ringede dialeren
 * derefter ud med en død mikrofon, indtil siden blev genindlæst.
 */
export function useLiveMicStream(enabled: boolean, micId: string): MediaStream | null {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [generation, setGeneration] = useState(0);
  const failuresRef = useRef(0);

  useEffect(() => {
    // Ingen stream at nulstille her: oprydningen fra forrige kørsel har allerede sat null.
    if (!enabled || !micId) return;
    let cancelled = false;
    let active: MediaStream | null = null;
    let retryTimer: number | undefined;
    const reopen = () => {
      if (!cancelled) setGeneration((g) => g + 1);
    };
    // Headsettet er kommet tilbage (eller en anden enhed er sat i) — åbn igen, hvis sporet er dødt.
    const onDeviceChange = () => {
      if (isLiveMicStream(active)) return;
      failuresRef.current = 0;
      reopen();
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);

    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: medlytSellerCaptureConstraints(micId),
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        failuresRef.current = 0;
        active = s;
        for (const t of s.getAudioTracks()) t.addEventListener("ended", reopen);
        setStream(s);
      } catch (e) {
        if (cancelled) return;
        setStream(null);
        // Afvist adgang kommer ikke igen af sig selv. Ellers er headsettet nok midt i at
        // koble til igen — prøv lidt senere.
        const denied = e instanceof DOMException && e.name === "NotAllowedError";
        failuresRef.current += 1;
        if (!denied && failuresRef.current < MAX_REOPEN_FAILURES) {
          retryTimer = window.setTimeout(reopen, REOPEN_RETRY_MS);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
      active?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [enabled, micId, generation]);

  return stream;
}

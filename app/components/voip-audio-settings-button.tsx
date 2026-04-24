"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureMicPermissionAndEnumerate,
  headsetSetupBlockedReason,
  labelForDeviceId,
  readSessionDeviceId,
  verifyMicDevice,
  VOIP_SESSION_MIC_KEY,
  VOIP_SESSION_SPK_KEY,
  writeSessionDeviceId,
} from "@/lib/voip-audio-devices";

const MANUAL_CONFIRM_KEY = "allio-voip-manual-headset-confirm";

function readManualConfirm(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(MANUAL_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

function writeManualConfirm(v: boolean) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (v) sessionStorage.setItem(MANUAL_CONFIRM_KEY, "1");
    else sessionStorage.removeItem(MANUAL_CONFIRM_KEY);
  } catch {
    /* no-op */
  }
}

type Props = {
  /** Tilføj ekstra klasser til ydre wrapper (fx layout). */
  className?: string;
};

/**
 * Standalone «Lydindstillinger»-knap til sider udenfor opkaldsstrippen
 * (fx /kampagner). Skriver til samme sessionStorage-nøgler som VoIP-strippen,
 * så valgte enheder automatisk er klar når brugeren starter Power Dialer.
 */
export function VoipAudioSettingsButton({ className }: Props) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permissionDone, setPermissionDone] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshInfo, setRefreshInfo] = useState<string | null>(null);
  const [micId, setMicId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [micVerifyOk, setMicVerifyOk] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [manualHeadsetConfirm, setManualHeadsetConfirmState] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

  const statusLabel = !permissionDone
    ? "Ikke tilladt"
    : audioSetupReady
      ? "Klar"
      : !micId
        ? "Vælg mikrofon"
        : needsSpeakerPick
          ? "Vælg lydudgang"
          : !micVerifyOk
            ? "Tjek mikrofon"
            : "Tjek headset";

  /** Læs gemte valg ved mount + lyt til devicechange. */
  useEffect(() => {
    const storedMic = readSessionDeviceId(VOIP_SESSION_MIC_KEY);
    const storedSpk = readSessionDeviceId(VOIP_SESSION_SPK_KEY);
    setMicId(storedMic);
    setSpeakerId(storedSpk);
    setManualHeadsetConfirmState(readManualConfirm());

    void (async () => {
      try {
        const status = await navigator.permissions
          ?.query?.({ name: "microphone" as PermissionName })
          .catch(() => null);
        if (status?.state === "granted") {
          const list = await navigator.mediaDevices.enumerateDevices();
          setDevices(list);
          setPermissionDone(true);
        }
      } catch {
        /* no-op — bruger kan trykke «Tillad mikrofon» */
      }
    })();
  }, []);

  useEffect(() => {
    if (!permissionDone || typeof navigator === "undefined" || !navigator.mediaDevices) return;
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

  /** Verificér valgt mikrofon. */
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

  /** Ryd ugyldige valg når enhedsliste ændres. */
  useEffect(() => {
    if (micId && !inputDevs.some((d) => d.deviceId === micId)) {
      setMicId("");
      writeSessionDeviceId(VOIP_SESSION_MIC_KEY, "");
      setManualHeadsetConfirmState(false);
      writeManualConfirm(false);
    }
    if (speakerId && !outputDevs.some((d) => d.deviceId === speakerId)) {
      setSpeakerId("");
      writeSessionDeviceId(VOIP_SESSION_SPK_KEY, "");
      setManualHeadsetConfirmState(false);
      writeManualConfirm(false);
    }
  }, [inputDevs, outputDevs, micId, speakerId]);

  /** Luk panel ved klik udenfor. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

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

      const storedMic = readSessionDeviceId(VOIP_SESSION_MIC_KEY);
      const storedSpk = readSessionDeviceId(VOIP_SESSION_SPK_KEY);
      const inputs = list.filter((d) => d.kind === "audioinput");
      const outputs = list.filter((d) => d.kind === "audiooutput");

      if (storedMic && inputs.some((i) => i.deviceId === storedMic)) {
        setMicId(storedMic);
      } else if (inputs.length === 1) {
        const only = inputs[0].deviceId;
        setMicId(only);
        writeSessionDeviceId(VOIP_SESSION_MIC_KEY, only);
      }

      if (storedSpk && outputs.some((o) => o.deviceId === storedSpk)) {
        setSpeakerId(storedSpk);
      } else if (outputs.length === 1) {
        const only = outputs[0].deviceId;
        setSpeakerId(only);
        writeSessionDeviceId(VOIP_SESSION_SPK_KEY, only);
      }
    } catch (e) {
      setSetupError(
        e instanceof Error ? e.message : "Mikrofon blev afvist eller er ikke tilgængelig.",
      );
    } finally {
      setSetupBusy(false);
    }
  }

  async function refreshDevices() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    setRefreshBusy(true);
    setRefreshInfo(null);
    try {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignorer — enumerate kan stadig give devicelist uden labels */
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list);
      if (!permissionDone) setPermissionDone(true);
      const inputs = list.filter((d) => d.kind === "audioinput").length;
      const outputs = list.filter((d) => d.kind === "audiooutput").length;
      setRefreshInfo(
        `Fundet ${inputs} mikrofon${inputs === 1 ? "" : "er"} og ${outputs} lydudgang${outputs === 1 ? "" : "e"}.`,
      );
    } catch (e) {
      setRefreshInfo(
        e instanceof Error ? `Kunne ikke genlæse: ${e.message}` : "Kunne ikke genlæse enhedsliste.",
      );
    } finally {
      setRefreshBusy(false);
    }
  }

  function setManualHeadsetConfirm(v: boolean) {
    setManualHeadsetConfirmState(v);
    writeManualConfirm(v);
  }

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
          open
            ? "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700"
            : audioSetupReady
              ? "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50"
              : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Konfigurer mikrofon og lydudgang før Power Dialer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M3 18v-6a9 9 0 1 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1v-7h3v5z" />
          <path d="M3 19a2 2 0 0 0 2 2h1v-7H3v5z" />
        </svg>
        <span>Lydindstillinger</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            audioSetupReady
              ? open
                ? "bg-emerald-800/30 text-white"
                : "bg-emerald-100 text-emerald-800"
              : open
                ? "bg-white/30 text-white"
                : "bg-amber-200 text-amber-900"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              audioSetupReady ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {statusLabel}
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Lydindstillinger"
          className="absolute right-0 z-30 mt-2 w-[min(92vw,28rem)] rounded-xl border border-emerald-200/80 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-900/85">
              Mikrofon &amp; lydudgang
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
              aria-label="Luk lydindstillinger"
            >
              Luk
            </button>
          </div>

          {!permissionDone ? (
            <div>
              <p className="mb-2 text-xs text-stone-700">
                Vi skal bruge adgang til mikrofonen så du kan ringe via Power Dialer.
              </p>
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
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 0 1-14.85 6.85L3 16" />
                    <path d="M21 22v-6h-6" />
                    <path d="M3 12a9 9 0 0 1 14.85-6.85L21 8" />
                    <path d="M3 2v6h6" />
                  </svg>
                  {refreshBusy ? "Genlæser…" : "Opdater enhedsliste"}
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="voip-front-mic"
                    className="text-[11px] font-medium text-emerald-900/90"
                  >
                    Mikrofon ({inputDevs.length})
                  </label>
                  <select
                    id="voip-front-mic"
                    value={micId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMicId(v);
                      setManualHeadsetConfirm(false);
                      writeSessionDeviceId(VOIP_SESSION_MIC_KEY, v);
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
                    htmlFor="voip-front-spk"
                    className="text-[11px] font-medium text-emerald-900/90"
                  >
                    Lydudgang ({outputDevs.length})
                  </label>
                  {outputDevs.length === 0 ? (
                    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
                      Browseren viser ingen separate lydudgange — tryk «Opdater enhedsliste» eller
                      sæt headset som standard i macOS Lyd.
                    </p>
                  ) : (
                    <select
                      id="voip-front-spk"
                      value={speakerId}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSpeakerId(v);
                        setManualHeadsetConfirm(false);
                        writeSessionDeviceId(VOIP_SESSION_SPK_KEY, v);
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
                  <label className="flex cursor-pointer items-start gap-2 rounded-md border border-stone-200/90 bg-stone-50/80 px-2 py-2 text-[11px] leading-snug text-stone-700">
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

              <p className="mt-3 rounded-md bg-emerald-50/80 px-2 py-2 text-[11px] leading-snug text-emerald-900">
                Valgte enheder gemmes for denne session. De er klar med det samme når du starter
                Power Dialer på en kampagne.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

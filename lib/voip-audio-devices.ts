/**
 * Persistente headset-valg — lagres i localStorage så agenten ikke skal vælge
 * mikrofon/lydudgang igen ved hvert kampagneskifte eller browserstart.
 *
 * Hvis browseren senere ikke kan finde den gemte enhed (afkoblet headset),
 * ryddes valget automatisk i komponenterne der bruger disse helpers.
 */
export const VOIP_STORED_MIC_KEY = "allio-voip-mic-device-id";
export const VOIP_STORED_SPK_KEY = "allio-voip-speaker-device-id";

/** @deprecated Brug `VOIP_STORED_MIC_KEY` — bibeholdt for bagudkompatibilitet. */
export const VOIP_SESSION_MIC_KEY = VOIP_STORED_MIC_KEY;
/** @deprecated Brug `VOIP_STORED_SPK_KEY` — bibeholdt for bagudkompatibilitet. */
export const VOIP_SESSION_SPK_KEY = VOIP_STORED_SPK_KEY;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Migrér tidligere sessionStorage-valg til localStorage (kører engang pr. browser). */
function migrateFromSessionStorageOnce(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const ls = window.localStorage;
    if (ls.getItem(key)) return;
    const ss = window.sessionStorage;
    const old = ss.getItem(key);
    if (old) {
      ls.setItem(key, old);
      ss.removeItem(key);
    }
  } catch {
    /* no-op */
  }
}

export function readStoredDeviceId(key: string): string {
  migrateFromSessionStorageOnce(key);
  const storage = getStorage();
  if (!storage) return "";
  try {
    const v = storage.getItem(key);
    return typeof v === "string" ? v.trim() : "";
  } catch {
    return "";
  }
}

export function writeStoredDeviceId(key: string, deviceId: string): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (deviceId) storage.setItem(key, deviceId);
    else storage.removeItem(key);
  } catch {
    /* no-op */
  }
}

/** @deprecated Brug `readStoredDeviceId`. */
export const readSessionDeviceId = readStoredDeviceId;
/** @deprecated Brug `writeStoredDeviceId`. */
export const writeSessionDeviceId = writeStoredDeviceId;

/** Efter tilladelse: hent liste med læsbare labels. */
export async function ensureMicPermissionAndEnumerate(): Promise<MediaDeviceInfo[]> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop());
  return navigator.mediaDevices.enumerateDevices();
}

export async function verifyMicDevice(deviceId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!deviceId) {
    return { ok: false, message: "Vælg en mikrofon." };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
    });
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState !== "live") {
      stream.getTracks().forEach((t) => t.stop());
      return { ok: false, message: "Mikrofonen er ikke aktiv." };
    }
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Kunne ikke åbne mikrofon.";
    return { ok: false, message: msg };
  }
}

export function labelForDeviceId(devices: MediaDeviceInfo[], deviceId: string): string {
  const d = devices.find((x) => x.deviceId === deviceId);
  return (d?.label || "").trim();
}

/**
 * Blokér åbenlys brug af indbygget Mac-mikrofon og/eller Mac-højttalere — kræv headset.
 * USB/Bluetooth-headset og tredjepartsnavne slipper igennem.
 * @param checkBuiltInSpeaker sæt false når browseren ikke udbyder audiooutput-enheder (så vi kun tjekker mic).
 */
export function headsetSetupBlockedReason(
  micLabel: string,
  outputLabel: string,
  opts?: { checkBuiltInSpeaker?: boolean },
): string | null {
  const checkSpk = opts?.checkBuiltInSpeaker !== false;
  const micBad = isProbablyBuiltInMacMic(micLabel);
  const outBad = checkSpk ? isProbablyBuiltInMacSpeaker(outputLabel) : false;
  if (micBad && outBad) {
    return "Vælg dit headset som både mikrofon og lydudgang — ikke den indbyggede Mac-mikrofon og højttalere.";
  }
  if (micBad) {
    return "Vælg headset-mikrofon (eller USB/Bluetooth-mikrofon) — ikke den indbyggede Mac-mikrofon.";
  }
  if (outBad) {
    return "Vælg headset eller hovedtelefoner som lydudgang — ikke Mac-højttalere.";
  }
  return null;
}

function isProbablyBuiltInMacMic(label: string): boolean {
  const l = label.toLowerCase();
  if (!l) return false;
  if (/headset|headphone|headphones|usb|øretelefon|øresnegl|earphone|jabra|plantronics|polycom|poly |logitech|sennheiser|steelseries|hyperx|audioengine/i.test(l)) {
    return false;
  }
  return /macbook|imac|built-in|indbygget|internal|microphone array|mikrofon \(mac/i.test(l);
}

function isProbablyBuiltInMacSpeaker(label: string): boolean {
  const l = label.toLowerCase();
  if (!l) return false;
  if (/headset|headphone|headphones|usb|øretelefon|airpods|jabra|plantronics|polycom|poly |logitech|sennheiser|steelseries|hyperx/i.test(l)) {
    return false;
  }
  return /macbook|imac|built-in|indbygget|højttalere|speakers|højtalere/i.test(l);
}

export async function setAudioElementSink(el: HTMLAudioElement | null, deviceId: string): Promise<void> {
  if (!el || !deviceId) return;
  const setSink = (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
  if (typeof setSink !== "function") return;
  try {
    await setSink.call(el, deviceId);
  } catch {
    /* Safari/ældre browsere — Telnyx speakerId kan stadig hjælpe */
  }
}

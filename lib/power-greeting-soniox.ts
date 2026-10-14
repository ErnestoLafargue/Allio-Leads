/**
 * Soniox is optional on Power Dialer. No credits / Telnyx transcription errors must
 * never block AMD: we skip greeting STT and settle on Telnyx AMD alone.
 */

export const POWER_GREETING_SONIOX_LISTEN = "listen";

/** After credits/quota errors, do not retry transcription_start for this long. */
export const POWER_SONIOX_SKIP_MS = 15 * 60 * 1000;

/** Fail fast so AMD is never queued behind a hung Soniox/Telnyx request. */
export const POWER_SONIOX_START_TIMEOUT_MS = 2500;

const CREDIT_RE =
  /credit|quota|balance|payment required|billing|insufficient|prepaid|out of fund|no funds|unpaid|exceeded.{0,24}(quota|limit)/i;

let skipUntil = 0;
let consecutiveFailures = 0;
let skipLogged = false;

export function isPowerSonioxListeningHint(hint: string | null | undefined): boolean {
  return hint === POWER_GREETING_SONIOX_LISTEN;
}

export function isPowerSonioxUnavailableError(status: number, message: string): boolean {
  if (status === 402 || status === 429) return true;
  return CREDIT_RE.test(message);
}

export function shouldAttemptPowerSoniox(now = Date.now()): boolean {
  return now >= skipUntil;
}

export function notePowerSonioxStartResult(
  ok: boolean,
  status: number,
  message: string,
  now = Date.now(),
): void {
  if (ok) {
    consecutiveFailures = 0;
    skipUntil = 0;
    skipLogged = false;
    return;
  }
  consecutiveFailures += 1;
  const credits = isPowerSonioxUnavailableError(status, message);
  if (credits || consecutiveFailures >= 3) {
    skipUntil = now + POWER_SONIOX_SKIP_MS;
    consecutiveFailures = 0;
    if (!skipLogged) {
      skipLogged = true;
      console.warn(
        "[power-dialer] Soniox utilgængelig — Power Dialer kører AMD alene i",
        Math.round(POWER_SONIOX_SKIP_MS / 60000),
        "min. Årsag:",
        message.slice(0, 180) || `HTTP ${status}`,
      );
    }
  }
}

/** Test-only: reset process-local circuit. */
export function resetPowerSonioxCircuitForTests(): void {
  skipUntil = 0;
  consecutiveFailures = 0;
  skipLogged = false;
}

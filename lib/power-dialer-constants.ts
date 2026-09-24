/**
 * Tekniske konstanter for Power Dialer (ikke brugerindstillinger — se `power-dialer-settings.ts`).
 */

/** Sekunder Telnyx ringer sælgerens WebRTC op, før agent-benet opgives. */
export const POWER_AGENT_LEG_TIMEOUT_SECS = 12;

/** Maks. antal sælgere et menneske-svar forsøges forbundet til (første forsøg + én retry). */
export const POWER_AGENT_MAX_ATTEMPTS = 2;

/** Drop-bremse: vindue og mindste stikprøve før bremsen kan slå til. */
export const POWER_DROP_BRAKE_WINDOW_MS = 15 * 60 * 1000;
export const POWER_DROP_BRAKE_MIN_SAMPLE = 10;

/** Ugyldigt nummer (Telnyx not_found / SIP 404, 410, 484, 604): ikke i Power-køen før om 7 dage. */
export const POWER_INVALID_NUMBER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/** Kø-reservation lever ringetid + dette (AMD + forbindelse til sælger + margin). */
export const POWER_QUEUE_TTL_EXTRA_SECS = 45;

/** Pause (drain): sælgeren kan forbindes i ringetid + dette antal sekunder. */
export const POWER_DRAIN_EXTRA_SECS = 10;

/** Reservation af sælger uden besvaret agent-ben frigives efter dette. */
export const POWER_RESERVATION_STALE_MS = 30_000;

/** Sælger der ikke svarede agent-benet springes over i dette tidsrum. */
export const POWER_MISSED_AGENT_BACKOFF_MS = 15_000;

/** Oprydning og cooldown-reset køres højst så ofte pr. server-instans. */
export const POWER_MAINTENANCE_INTERVAL_MS = 30_000;
export const POWER_COOLDOWN_RESET_INTERVAL_MS = 60_000;

/** Premium-AMD: kun total_analysis_time_millis og greeting_duration_millis gælder for premium. */
export const POWER_AMD_TOTAL_ANALYSIS_MS = 3500;

/** Uforbundne lead-ben uden events afsluttes af oprydningen efter ringetid + dette. */
export const POWER_STALE_LEG_EXTRA_MS = 5 * 60 * 1000;

export function powerQueueReservationTtlMs(ringTimeoutSecs: number): number {
  return (ringTimeoutSecs + POWER_QUEUE_TTL_EXTRA_SECS) * 1000;
}

export function powerDrainWindowMs(ringTimeoutSecs: number): number {
  return (ringTimeoutSecs + POWER_DRAIN_EXTRA_SECS) * 1000;
}

/**
 * Estimeret aktiv tid ud fra hændelses-tidsstempler (opkald, udfald, kø-besøg).
 *
 * Bruges til historiske dage FØR presence-heartbeatet begyndte at måle rigtig
 * login-/dialer-tid. Målt tid vinder altid over estimatet — se `scoreboard-day.ts`.
 */

/** Mellemrum større end dette regnes som pause og tælles ikke med. */
export const PRESENCE_ESTIMATE_MAX_GAP_MS = 15 * 60 * 1000;

/**
 * Sekunder lagt til pr. arbejdsblok, så en enkeltstående hændelse (fx ét opkald)
 * ikke estimeres til 0. Svarer til «mindst et minuts arbejde pr. blok».
 */
export const PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS = 60;

/**
 * Summerer tiden mellem hændelser inden for samme arbejdsblok. Et mellemrum over
 * `maxGapMs` afslutter blokken; hver blok får `blockTailSeconds` lagt til.
 * Tom liste giver 0.
 */
export function estimateActiveSeconds(
  timestamps: Date[],
  maxGapMs: number = PRESENCE_ESTIMATE_MAX_GAP_MS,
  blockTailSeconds: number = PRESENCE_ESTIMATE_BLOCK_TAIL_SECONDS,
): number {
  if (timestamps.length === 0) return 0;

  const sorted = [...timestamps].sort((a, b) => a.getTime() - b.getTime());
  let totalMs = 0;
  let blocks = 1;

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.getTime() - sorted[i - 1]!.getTime();
    if (gap <= maxGapMs) {
      totalMs += gap;
    } else {
      blocks += 1;
    }
  }

  return Math.round(totalMs / 1000) + blocks * blockTailSeconds;
}

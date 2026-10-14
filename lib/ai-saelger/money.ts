/**
 * Beløb til visning i AI-sælger-siderne. API'erne afregner i USD; vi viser vejledende kroner med samme
 * kurs som Telnyx-oversigten (app/api/admin/telnyx-cost).
 */
export const USD_TO_DKK_APPROX = 6.9;

/** «ca. 0,17 kr.» (eller «under 0,01 kr.»). */
export function kroner(usd: number): string {
  const dkk = usd * USD_TO_DKK_APPROX;
  if (dkk > 0 && dkk < 0.01) return "under 0,01 kr.";
  return `ca. ${dkk.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}

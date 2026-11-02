/**
 * Telnyx-saldo: når kontoen står i nul eller minus, afviser Telnyx alle opkald, og sælgeren
 * ser kun en generisk fejl. Bruges til at vise den rigtige årsag i opkaldsfejlen.
 */

export const TELNYX_NO_BALANCE_TEXT = "Telnyx-saldo er brugt op – kontakt admin";

/** Telnyx' balance-svar (`GET /v2/balance`) → om kontoen er spærret pga. saldo. */
export function isTelnyxBalanceExhausted(data: { available_credit?: string; balance?: string } | null): boolean {
  const raw = data?.available_credit ?? data?.balance;
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n <= 0;
}

/** Henter saldoen; `null` hvis den ikke kan læses (manglende nøgle, netværk). */
export async function fetchTelnyxBalanceExhausted(): Promise<boolean | null> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.telnyx.com/v2/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { available_credit?: string; balance?: string } };
    return isTelnyxBalanceExhausted(json.data ?? null);
  } catch {
    return null;
  }
}

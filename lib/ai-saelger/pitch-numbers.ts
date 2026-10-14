/**
 * Tallene i pitchen, regnet ud fra kundens eget kartotek (Ernesto, 14/10): ca. 40 % af kunderne er
 * inaktive; Allio genaktiverer 2–12 % af dem om måneden (helst 2–5 %), så det lander på 10–20
 * genbookinger om måneden. Små kartoteker får det reelle tal: vi pynter ikke over 12 %.
 */

export const INACTIVE_SHARE = 0.4;
const PREFERRED_MAX_PCT = 5;
const MIN_PCT = 2;
const MAX_PCT = 12;
const TARGET_MIN = 10;
const TARGET_MAX = 20;

export type PitchNumbers = { customers: number; inactive: number; ratePct: number; rebookingsPerMonth: number };

export function pitchNumbers(customers: number): PitchNumbers {
  const inactive = Math.round(customers * INACTIVE_SHARE);
  const per = (pct: number) => Math.round((inactive * pct) / 100);
  let ratePct = MIN_PCT;
  // Laveste rate (helst højst 5 %), der når mindst 10 om måneden; ellers op til 12 %.
  while (ratePct < MAX_PCT && per(ratePct) < TARGET_MIN) ratePct++;
  if (ratePct > PREFERRED_MAX_PCT && per(PREFERRED_MAX_PCT) >= TARGET_MIN) ratePct = PREFERRED_MAX_PCT;
  // Store kartoteker: selv 2 % giver mere end 20, så vi siger 20 (forsigtigt frem for overdrevet).
  const rebookingsPerMonth = Math.min(per(ratePct), TARGET_MAX);
  return { customers, inactive, ratePct, rebookingsPerMonth };
}

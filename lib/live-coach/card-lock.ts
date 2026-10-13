/**
 * Holder coach-kortet stille, så sælgeren kan nå at læse det højt. Et kort bliver stående, til:
 *  - sælgeren har sagt noget, der ligner replikken (så er det «brugt», og næste indvending må komme),
 *  - sælgeren lukker det, eller
 *  - kunden kommer med en ANDEN indvending, og kortet har stået i mindst MIN_DWELL_MS.
 * Samme indvending igen giver aldrig et nyt kort. AI-versionen må kun afløse straks-kortet (fra
 * ugens script) for samme indvending i de første sekunder, før sælgeren er gået i gang.
 */
import { normalizeSpeech } from "./triggers";

export const MIN_DWELL_MS = 20_000;
export const MAX_DWELL_MS = 90_000;
export const REFINE_WINDOW_MS = 3_000;

export type LockedCard = { category: string | null; line: string; source: "trigger" | "ai"; shownAt: number; used: boolean };

const STOPWORDS = new Set([
  "ikke", "også", "eller", "jeres", "jeg", "vores", "have", "bare", "kunne", "skal", "lige", "noget", "være", "hvad",
  "hvis", "når", "men", "det", "der", "som", "med", "for", "til", "jer", "den", "dem", "man", "kan", "vil", "har",
  "lad", "mig", "dig", "din", "dit", "jeres", "selv", "helt", "godt", "sådan", "altså", "netop", "faktisk",
]);

function contentWords(text: string): string[] {
  return normalizeSpeech(text)
    .split(" ")
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** Har sælgeren sagt noget, der ligner replikken? (ordstammer, så bøjninger tæller med) */
export function saidSimilar(line: string, spoken: string): boolean {
  const target = [...new Set(contentWords(line))];
  if (!target.length) return false;
  const stems = new Set(contentWords(spoken).map((w) => w.slice(0, 5)));
  const hits = target.filter((w) => stems.has(w.slice(0, 5))).length;
  return hits >= Math.min(4, Math.max(2, Math.ceil(target.length * 0.4)));
}

export class CardLock {
  current: LockedCard | null = null;
  private heard = "";

  /** Må et nyt kort for denne indvending (null = uden kategori) vises nu? */
  canShow(category: string | null, source: "trigger" | "ai", now: number): boolean {
    const c = this.current;
    if (!c || c.used || now - c.shownAt >= MAX_DWELL_MS) return true;
    if (source === "ai" && c.source === "trigger" && category === c.category && now - c.shownAt <= REFINE_WINDOW_MS) return true;
    if (category === null || category === c.category) return false;
    return now - c.shownAt >= MIN_DWELL_MS;
  }

  show(card: Omit<LockedCard, "used">): void {
    this.current = { ...card, used: false };
    this.heard = "";
  }

  /** Sælgerens tale (ufærdig eller færdig). Returnerer true, når kortet netop er blevet brugt. */
  onAgentSpeech(text: string, completed: boolean): boolean {
    const c = this.current;
    if (!c || c.used) return false;
    const all = `${this.heard} ${text}`;
    if (completed) this.heard = all.slice(-1000);
    if (!saidSimilar(c.line, all)) return false;
    c.used = true;
    return true;
  }

  dismiss(): void {
    if (this.current) this.current.used = true;
  }

  /** Et aktivt kort (vist og endnu ikke brugt). */
  get active(): LockedCard | null {
    return this.current && !this.current.used ? this.current : null;
  }
}

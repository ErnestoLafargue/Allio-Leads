/**
 * Live-coach: følger sælgeren i ugens script.
 *  - SCRIPT:    sælgeren følger scriptet → vis næste linje.
 *  - AFVIGELSE: kunden kom med en indvending/et signal → coach-kortet hjælper.
 *  - TILBAGE:   sælgeren har svaret → «Tilbage til: <næste linje>», indtil sælgeren rammer scriptet igen.
 * Sælgerens ytringer matches mod de næste linjer med ordoverlap (robust over for småord og stavning).
 */
export type ScriptLine = { phase: string; text: string };
export type TrackerState = "script" | "afvigelse" | "tilbage";

const STOPWORDS = new Set(
  "og i at det er en et du jeg vi de der som på med for til har ikke men så kan vil man hvad den om af også lige bare jo nu ja nej hej eller fra skal være mig dig jer os sig hvis når".split(" "),
);

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Andel af scriptlinjens indholdsord, som sælgeren sagde (0–1). */
export function lineMatch(utterance: string, line: string): number {
  const said = new Set(contentWords(utterance));
  // Pladsholdere som «[navn]» og «[dit navn]» siges aldrig ordret.
  const words = [...new Set(contentWords(line.replace(/\[[^\]]*\]/g, " ")))];
  if (!words.length) return 0;
  // Tillad bøjninger: «tal» ~ «tallene» (fælles start på mindst 4 tegn).
  const hit = words.filter((w) => said.has(w) || [...said].some((s) => s.length >= 4 && w.length >= 4 && (s.startsWith(w.slice(0, 4)) && w.startsWith(s.slice(0, 4)))));
  return hit.length / words.length;
}

export const MATCH_THRESHOLD = 0.4;
const LOOKAHEAD = 4;

export class ScriptTracker {
  position = 0;
  state: TrackerState = "script";

  constructor(private readonly lines: readonly ScriptLine[]) {}

  get nextLine(): ScriptLine | null {
    return this.lines[this.position] ?? null;
  }

  /** Sælgeren har sagt noget færdigt: ramte det en af de næste linjer, er vi (tilbage) i scriptet. */
  onAgentUtterance(text: string): void {
    let best = -1;
    let bestScore = MATCH_THRESHOLD;
    for (let i = this.position; i < Math.min(this.lines.length, this.position + LOOKAHEAD); i++) {
      const score = lineMatch(text, this.lines[i]!.text);
      if (score >= bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best >= 0) {
      this.position = best + 1;
      this.state = "script";
    } else if (this.state === "afvigelse") {
      this.state = "tilbage";
    }
  }

  /** Kunden kom med en indvending eller et signal. */
  onDeviation(): void {
    this.state = "afvigelse";
  }
}

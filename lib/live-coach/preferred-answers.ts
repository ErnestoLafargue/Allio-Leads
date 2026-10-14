/**
 * Ernestos egne foretrukne svar — vægter højest. De erstatter ugens script-svar i live-coachens
 * straks-kort, står øverst i AI'ens systemprompt og overskriver skabelonen i indvendingsbogen for
 * samme kategori. Tilføj nye her, når et forslag er forkert («man kunne i stedet sige …»).
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";

export type PreferredAnswer = {
  /** Svaret, som sælgeren kan sige — [pladsholdere] tilpasses kunden. */
  line: string;
  /** Hvorfor / hvornår — til AI'en og siden «Indvendinger». */
  principle: string;
};

export const PREFERRED_ANSWERS: Partial<Record<ObjectionCategory, PreferredAnswer>> = {
  send_email: {
    line: "Det giver god mening, jeg sender også gerne en mail. Men den siger kun noget generelt, og det vigtige er jeres egne kundetal. Ville det derfor kunne passe, at jeg ringer kort igen i morgen for at fortælle en smule mere?",
    principle:
      "Kunden har bedt om en mail: sig ja til mailen, forklar at den kun er generel, og aftal et kort opkald i morgen — gå ikke direkte efter mødet. (Ernesto, 13/10-2026)",
  },
};

/** Ugens script-svar med Ernestos foretrukne svar ovenpå. */
export function withPreferred(responses: Partial<Record<ObjectionCategory, string>>): Partial<Record<ObjectionCategory, string>> {
  const out = { ...responses };
  for (const [cat, p] of Object.entries(PREFERRED_ANSWERS)) if (p) out[cat as ObjectionCategory] = p.line;
  return out;
}

/** Til systemprompten. */
export function preferredAnswersText(): string {
  return Object.entries(PREFERRED_ANSWERS)
    .map(([cat, p]) => `- ${cat}: «${p!.line}»\n  ${p!.principle}`)
    .join("\n");
}

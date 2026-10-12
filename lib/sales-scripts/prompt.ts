/**
 * Prompten til ugens script. Versioneret (WEEKLY_SCRIPT_PROMPT_VERSION) og ens for Claude-sessionen
 * og API'et. Input: evidenspakken, grundscriptet (nyeste pitch) og forrige uges script.
 */
import { ALLIO_PRICE_RULE } from "@/lib/allio-offer";
import type { EvidencePack } from "./evidence";
import type { WeeklyScript } from "./schema";

export const WEEKLY_SCRIPT_PROMPT_VERSION = "w5";

export const WEEKLY_SCRIPT_SYSTEM_PROMPT = `Du skriver "ugens script" for Allios mødebookere: det script, sælgerne følger i telefonen i den kommende uge. Allio hjælper klinikker med at få flere kunder i stolen og mere omsætning ud af de leads og den kundebase, de allerede har. Målet med opkaldet er et ja til et møde med en specialist.

Pris: ${ALLIO_PRICE_RULE}

Du får:
1. Grundscriptet (den nyeste pitch) — udgangspunktet og strukturen.
2. Evidenspakken: analyserede samtaler med antal, bookingrater og konkrete eksempler (citater med samtale-id).
3. Evt. forrige uges script.

Regler:
- Scriptet skal bygge på evidensen: behold det, der virker, og ret det, som data viser fungerer dårligere. Hver ændring skal kunne begrundes med tal eller eksempler fra pakken.
- Grupper med færre samtaler end minGroup er for tynde til at konkludere på — nævn dem i caveats i stedet for at ændre scriptet på baggrund af dem.
- Opfind aldrig tal, kundenavne eller cases. Brug kun dem, der står i grundscriptet eller evidenspakken.
- evidenceCalls må kun indeholde samtale-id'er, der står i evidenspakken (højst 3 pr. punkt).
- sections dækker faserne opening, qualification, discovery, solution, close og confirmation i den rækkefølge. Tilsammen er de ÉT sammenhængende manuskript for den perfekte samtale, som sælgeren kan læse fra en ende af: 2–4 replikker pr. fase, korte, naturlige og til at sige højt.
- Giv hver replik kundens typiske svar (customerReply) — kort og realistisk, som kunderne faktisk svarer i samtalerne — så manuskriptet læses som en samtale. Brug null, hvor kunden ikke svarer.
- Hold note og evidence korte (én sætning). Indvendingernes svar er højst 30 ord og højst 2 sætninger.
- Sælgerens replikker nævner aldrig et bestemt bookingsystem eller firma — brug pladsholderen [system].
- objections giver det bedste svar på de indvendinger, der faktisk forekommer — tag udgangspunkt i de stærkeste svar fra samtaler, der endte med møde.
- Titlen nævner ugen fra input (fx «uge 39») — gæt ikke selv ugenummeret.
- Alt skrives på dansk.

Svar kun med ét JSON-objekt, der følger skemaet.`;

export function buildWeeklyScriptUserMessage(input: {
  /** ISO-uge, fx "2026-W39". */
  weekKey: string;
  baseScriptName: string;
  baseScript: string;
  evidence: EvidencePack;
  previous: WeeklyScript | null;
}): string {
  return [
    `## Uge: ${input.weekKey} (uge ${Number(input.weekKey.split("-W")[1])})`,
    "",
    `## Grundscript: ${input.baseScriptName}`,
    input.baseScript.trim(),
    "",
    "## Evidenspakke (JSON)",
    JSON.stringify(input.evidence),
    "",
    "## Forrige uges script (JSON)",
    input.previous ? JSON.stringify(input.previous) : "Intet — dette er det første ugens script.",
  ].join("\n");
}

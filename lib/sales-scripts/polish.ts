/**
 * Ugens script, lag 2: «finpudsning». Første AI-kald sætter scriptet sammen ud fra data — replik
 * for replik. Her læser en ny AI hele manuskriptet som ÉN samtale og får det til at hænge sammen:
 * rækkefølge, overgange og formuleringer, så hver replik følger naturligt af kundens svar.
 * Den må ikke opfinde tal, påstande eller cases og skal bevare evidensen.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { structuredCall } from "@/lib/anthropic-client";
import { WeeklyScriptSchema, type WeeklyScript } from "./schema";

export const POLISH_PROMPT_VERSION = "p2";

export const POLISH_SYSTEM_PROMPT = `Du er en erfaren dansk salgstræner og manuskriptforfatter for Allios mødebookere. Du får et udkast til "ugens script", som er sat sammen replik for replik ud fra data. Hver replik er god for sig, men helheden hænger ikke altid sammen. Din opgave er at finpudse det til ÉT sammenhængende manuskript for den perfekte samtale, som en sælger kan læse højt fra start til slut.

Sådan:
- Læs det som én samtale: sælgerens replik → kundens svar (customerReply) → næste replik skal følge naturligt af netop det svar. Ret overgange, så der ikke er spring, gentagelser eller modsigelser.
- Ret rækkefølgen inden for en fase, hvis det giver bedre flow. Slå replikker sammen eller fjern dem, der gentager hinanden (2–4 replikker pr. fase).
- Gør replikkerne mundrette: korte sætninger, talesprog, til at sige højt. Kundens svar skal være realistiske og korte.
- Faserne skal stadig være opening, qualification, discovery, solution, close og confirmation i den rækkefølge.
- Indvendingerne: hvert svar er HØJST 30 ord og højst 2 sætninger, i samme tone som manuskriptet, og slutter med et konkret spørgsmål eller alternativt valg mod mødet.
- Titlen og summary må gerne skærpes, så de beskriver helheden.

Regler — vigtigt:
- Opfind ALDRIG tal, procenter, kundenavne, cases eller påstande, der ikke står i udkastet. Behold de tal og eksempler, der står der.
- Behold evidenceCalls, evidence, note, changes og caveats på de replikker og indvendinger, de hører til. Slår du replikker sammen, så slå deres evidenceCalls sammen (højst 3).
- Pladsholdere som [navn], [dit navn] og [system] bevares. Sælgerens replikker nævner ALDRIG et bestemt bookingsystem eller firma (fx Gecko, Planway, Onlinebooq) — skriv [system]. Kun kundens svar må nævne et konkret system.
- Alt på dansk. Svar kun med ét JSON-objekt, der følger skemaet.`;

export async function polishWeeklyScript(
  client: Anthropic,
  draft: WeeklyScript,
): Promise<{ script: WeeklyScript; costUsd: number }> {
  const { output, costUsd } = await structuredCall({
    client,
    system: POLISH_SYSTEM_PROMPT,
    userMessage: `## Udkast til ugens script (JSON)\n${JSON.stringify(draft)}\n\nFinpuds det nu til ét sammenhængende manuskript.`,
    schema: WeeklyScriptSchema,
    maxTokens: 32000,
  });
  return { script: output, costUsd };
}

/**
 * Dommeren på øvebanen: vurderer en simuleret samtale mod playbooken, reglerne og det, der booker møder
 * i jeres rigtige samtaler. Struktureret svar (zod), Claude Opus 5.5.
 */
import type Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { structuredCall } from "@/lib/anthropic-client";
import { transcriptText, type SimResult } from "./simulate";

export const JUDGE_MODEL = "claude-opus-5-5";

export const JudgeSchema = z.object({
  moede_booket: z.boolean(),
  karakterer: z.object({
    aabning: z.number().int().min(1).max(5),
    fulgte_playbooken: z.number().int().min(1).max(5),
    dialog_ikke_monolog: z.number().int().min(1).max(5),
    indvendinger: z.number().int().min(1).max(5),
    lukning: z.number().int().min(1).max(5),
    menneskelig: z.number().int().min(1).max(5),
  }),
  regelbrud: z.array(z.string()).describe("Brud på reglerne: opdigtede tal/cases, forkert pris, benægtede AI, nævnte AI selv, foreslog online før 2 forsøg, monolog osv."),
  bedste_replik: z.string(),
  svageste_replik: z.string(),
  hvorfor_udfaldet: z.string().describe("1-2 sætninger: hvorfor kunden bookede eller ikke bookede."),
  forbedringer: z.array(z.string()).describe("Højst 3 konkrete ændringer til playbooken med en bedre formulering."),
});
export type JudgeResult = z.infer<typeof JudgeSchema>;

const SYSTEM = `Du er salgschef for Allio og vurderer en øvesamtale mellem AI-mødebookeren og en simuleret klinikejer. Målet er et fysisk møde (45–60 min) med en specialist. Vær ærlig og konkret; ros ikke for meget.

Det, der booker møder i Allios rigtige samtaler: kunden taler (dialog, ét spørgsmål ad gangen), regnestykket på kundens egne tal, «send en mail» og pris håndteres (43 % booking mod 6–14 %), «jeg er bare mødebooker … din egen data … en kop kaffe»-lukningen, to konkrete tider (torsdag/fredag først).

Regler agenten skal følge: ingen opdigtede tal eller cases (kun Trine Toft i Greve, Anne i Randers, klinikken i Køge, Laurita på Østerbro); prisen er 2.500 kr./md., bookingsystemet gratis; nævner aldrig selv at den er AI, men benægter det ikke, hvis spurgt; to forsøg på fysisk møde før online; respekterer Robinson; aldrig «koldt opkald».`;

export async function judgeCall(client: Anthropic, sim: SimResult, playbook: string) {
  return structuredCall({
    client,
    model: JUDGE_MODEL,
    schema: JudgeSchema,
    maxTokens: 4000,
    effort: "medium",
    system: SYSTEM,
    userMessage: `## Playbook agenten skulle følge\n${playbook}\n\n## Samtalen (simuleret kunde: ${sim.persona})\n${transcriptText(sim.lines)}\n\nBooket i systemet: ${sim.booked ? JSON.stringify(sim.booked) : "nej"} · Udfald: ${sim.outcome ?? "ikke sat"}`,
  });
}

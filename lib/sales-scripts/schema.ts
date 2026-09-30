/**
 * Ugens script (SalesScriptVersion.content for kind WEEKLY). Genereres ud fra evidenspakken
 * (evidence.ts) — i Claude-sessionen første gang, derefter via API'et — og udgives automatisk.
 */
import * as z from "zod/v4";
import { OBJECTION_CATEGORIES, PHASES } from "@/lib/call-analysis/schema";

const EvidenceCalls = z.array(z.string()).describe("callRecordingId'er fra evidenspakken, der understøtter punktet (0-3)");

export const WeeklyScriptSchema = z.object({
  title: z.string(),
  summary: z.string().describe("2-4 sætninger: ugens vigtigste ændringer og hvorfor"),
  sections: z.array(
    z.object({
      key: z.enum(PHASES),
      title: z.string(),
      lines: z.array(
        z.object({
          text: z.string().describe("Replikken, som sælgeren siger den"),
          note: z.string().nullable().describe("Kort vejledning: hvornår og hvordan, ellers null"),
          evidenceCalls: EvidenceCalls,
        }),
      ),
      evidence: z.string().describe("1-2 sætninger om, hvad data viser for denne fase (antal samtaler, bookingrate)"),
    }),
  ),
  objections: z.array(
    z.object({
      category: z.enum(OBJECTION_CATEGORIES),
      customerSays: z.string(),
      response: z.string(),
      evidence: z.string(),
      evidenceCalls: EvidenceCalls,
    }),
  ),
  changes: z.array(z.object({ what: z.string(), why: z.string() })).describe("Ændringer i forhold til forrige script"),
  caveats: z.array(z.string()).describe("Hvor data er for tyndt til at konkludere"),
});

export type WeeklyScript = z.infer<typeof WeeklyScriptSchema>;

export function weeklyScriptJsonSchema(): unknown {
  return z.toJSONSchema(WeeklyScriptSchema);
}

/** Indhold for de historiske pitches (kind SEED): råteksten fra docs/salgsscripts. */
export type SeedScriptContent = { format: "text"; text: string };

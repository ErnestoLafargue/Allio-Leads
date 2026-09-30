/**
 * Skema for AI-analysen af én salgssamtale (version: ANALYSIS_VERSION i prompt.ts).
 *
 * Evidensprincip: modellen udtrækker fakta med ordrette citater og segmentnumre — ingen scorer.
 * Scorerne beregnes bagefter af koden (score.ts), og citaterne tjekkes mod transskriptionen
 * (validate.ts). Samme skema bruges i Claude-sessionen (historikken) og af workeren via API'et.
 */
import * as z from "zod/v4";

export const PHASES = ["opening", "qualification", "discovery", "solution", "close", "confirmation"] as const;
export const PITCHES = ["pitch_5", "pitch_6", "pitch_7", "onlinebooq_free", "pitch_nynyny", "other", "unclear"] as const;
export const OBJECTION_CATEGORIES = [
  "has_booking_system",
  "has_agency",
  "no_time",
  "price",
  "send_email",
  "not_interested",
  "think_about_it",
  "talk_to_partner",
  "fully_booked",
  "bad_timing",
  "other",
] as const;
export const CUSTOMER_SIGNALS = ["tryghed", "klarhed", "okonomi", "skepsis", "timing", "lav_interesse"] as const;
export const MOMENT_KINDS = ["strong", "improve", "missed"] as const;

export type Phase = (typeof PHASES)[number];
export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number];
export type CustomerSignal = (typeof CUSTOMER_SIGNALS)[number];

const Evidence = z.object({
  seg: z.number().int().describe("Segmentnummeret [n] fra transskriptionen"),
  quote: z.string().describe("Ordret udsnit af segmentets tekst (maks. ca. 25 ord)"),
});

const Quality = z.enum(["strong", "ok", "weak"]);

export const CallAnalysisSchema = z.object({
  language: z.enum(["da", "en", "other"]),
  callType: z.enum(["cold_call", "follow_up", "rebooking", "gatekeeper", "voicemail", "wrong_person", "other"]),
  isSalesConversation: z
    .boolean()
    .describe("false hvis der aldrig kom en reel samtale med en beslutningstager (telefonsvarer, forkert person, afbrudt straks)"),
  summary: z.string().describe("2-3 sætninger på dansk: hvem, hvad skete, hvordan endte det"),
  pitch: z.object({ version: z.enum(PITCHES), evidence: z.array(Evidence) }),
  phases: z.array(
    z.object({
      phase: z.enum(PHASES),
      present: z.boolean(),
      startSeg: z.number().int().nullable().describe("Segmentnummer hvor fasen begynder"),
      quality: Quality.nullable().describe("null hvis fasen mangler"),
      evidence: z.array(Evidence),
      note: z.string().describe("Kort begrundelse på dansk"),
    }),
  ),
  objections: z.array(
    z.object({
      category: z.enum(OBJECTION_CATEGORIES),
      customer: Evidence,
      response: Evidence.nullable(),
      handling: z.enum(["strong", "ok", "weak", "none"]),
      followsPreferredAnswer: z.boolean().describe("Følger svaret Allios foretrukne svar på netop denne indvending?"),
      note: z.string(),
    }),
  ),
  customerSignals: z.array(
    z.object({ signal: z.enum(CUSTOMER_SIGNALS), evidence: Evidence, addressedByAgent: z.boolean() }),
  ),
  moments: z.array(
    z.object({
      kind: z.enum(MOMENT_KINDS),
      title: z.string().describe("Kort overskrift på dansk (maks. 8 ord)"),
      evidence: Evidence,
      explanation: z.string().describe("1-2 sætninger på dansk"),
      betterLine: z.string().nullable().describe("Forslag til en bedre replik (improve/missed), ellers null"),
    }),
  ),
  closeAttempts: z.array(z.object({ evidence: Evidence, style: z.enum(["alternative_choice", "direct", "soft"]) })),
  nextStep: z.object({
    type: z.enum(["meeting_booked", "callback", "send_email", "none", "other"]),
    detail: z.string().nullable(),
    evidence: Evidence.nullable(),
  }),
});

export type CallAnalysisOutput = z.infer<typeof CallAnalysisSchema>;
export type EvidenceRef = z.infer<typeof Evidence>;

/** Evidens efter validering: citatet er genfundet, og tidspunktet (sekunder) er slået op i segmentet. */
export type ResolvedEvidence = EvidenceRef & { t: number };

/** Det gemte resultat (CallAnalysis.result): samme form som modeloutputtet, men med tidspunkter på al evidens. */
export type StoredCallAnalysis = Omit<
  CallAnalysisOutput,
  "pitch" | "phases" | "objections" | "customerSignals" | "moments" | "closeAttempts" | "nextStep"
> & {
  pitch: { version: CallAnalysisOutput["pitch"]["version"]; evidence: ResolvedEvidence[] };
  phases: (Omit<CallAnalysisOutput["phases"][number], "evidence"> & { evidence: ResolvedEvidence[]; startT: number | null })[];
  objections: (Omit<CallAnalysisOutput["objections"][number], "customer" | "response"> & {
    customer: ResolvedEvidence;
    response: ResolvedEvidence | null;
  })[];
  customerSignals: (Omit<CallAnalysisOutput["customerSignals"][number], "evidence"> & { evidence: ResolvedEvidence })[];
  moments: (Omit<CallAnalysisOutput["moments"][number], "evidence"> & { evidence: ResolvedEvidence })[];
  closeAttempts: (Omit<CallAnalysisOutput["closeAttempts"][number], "evidence"> & { evidence: ResolvedEvidence })[];
  nextStep: Omit<CallAnalysisOutput["nextStep"], "evidence"> & { evidence: ResolvedEvidence | null };
};

/** JSON Schema til Claude-sessionen (samme skema som API'et får via zodOutputFormat). */
export function analysisJsonSchema(): unknown {
  return z.toJSONSchema(CallAnalysisSchema);
}

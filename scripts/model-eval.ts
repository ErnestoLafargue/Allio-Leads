/**
 * Kvalitetstest af analysemodellen: analyserer guldsættet (samtaler analyseret af Opus i sessionen)
 * med en anden model via API'et og sammenligner med Opus. Gemmer intet i databasen.
 *
 * Brug:  set -a; . ./.env.local; . ./.env.branch; set +a
 *        npx tsx --tsconfig tsconfig.json scripts/model-eval.ts --model claude-haiku-5-5 [--limit 30]
 */
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { createAnthropicClient, structuredCall } from "@/lib/anthropic-client";
import { ANALYSIS_SYSTEM_PROMPT } from "@/lib/call-analysis/prompt";
import { CallAnalysisSchema, type StoredCallAnalysis } from "@/lib/call-analysis/schema";
import { scoreAnalysis, type CallScores } from "@/lib/call-analysis/score";
import { loadAnalysisInput } from "@/lib/call-analysis/store";
import { validateAnalysis } from "@/lib/call-analysis/validate";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const QUALITY_RANK: Record<string, number> = { weak: 0, ok: 1, strong: 2 };

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  return [...A].filter((x) => B.has(x)).length / new Set([...A, ...B]).size;
}

type Row = {
  overallDelta: number | null;
  pitch: boolean;
  nextStep: boolean;
  callType: boolean;
  objections: number;
  phasesPresent: number;
  phaseQuality: number;
  warnings: number;
  items: number;
  costUsd: number;
  moments: [number, number];
};

async function main() {
  assertExpectedDatabase();
  const model = arg("--model") ?? "claude-haiku-5-5";
  const limit = Number(arg("--limit") ?? 30);
  const effort = (arg("--effort") ?? undefined) as "low" | "medium" | "high" | "xhigh" | "max" | undefined;
  const client = createAnthropicClient();
  const gold = await prisma.callAnalysis.findMany({
    where: { model: "session-opus" },
    select: { callRecordingId: true, result: true, scores: true },
    orderBy: { callRecordingId: "asc" },
    take: limit,
  });

  const rows: Row[] = [];
  const queue = [...gold];
  const worker = async () => {
    for (let g = queue.shift(); g; g = queue.shift()) {
      try {
        const { userMessage, segments } = await loadAnalysisInput(g.callRecordingId);
        const { output, costUsd } = await structuredCall({
          client,
          model,
          effort,
          system: ANALYSIS_SYSTEM_PROMPT,
          userMessage,
          schema: CallAnalysisSchema,
          maxTokens: 32000,
        });
        const { analysis, warnings } = validateAnalysis(output, segments);
        const scores = scoreAnalysis(analysis, segments);
        const ref = g.result as unknown as StoredCallAnalysis;
        const refScores = g.scores as unknown as CallScores;
        const phase = (a: StoredCallAnalysis, k: string) => a.phases.find((p) => p.phase === k);
        const keys = ref.phases.map((p) => p.phase);
        const presentAgree = keys.filter((k) => (phase(analysis, k)?.present ?? false) === (phase(ref, k)?.present ?? false)).length / keys.length;
        const both = keys.filter((k) => phase(analysis, k)?.quality && phase(ref, k)?.quality);
        const qualityAgree = both.length
          ? both.filter((k) => Math.abs(QUALITY_RANK[phase(analysis, k)!.quality!]! - QUALITY_RANK[phase(ref, k)!.quality!]!) <= 0).length / both.length
          : 1;
        const items = analysis.moments.length + analysis.objections.length + analysis.customerSignals.length + analysis.closeAttempts.length;
        rows.push({
          overallDelta: scores.overall !== null && refScores.overall !== null ? scores.overall - refScores.overall : null,
          // Pitch 8 bygger på NyNyNy og fandtes ikke, da guldsættet blev lavet — regnes som samme pitch.
          pitch: [analysis.pitch.version, ref.pitch.version].every((v) => v === "pitch_8" || v === "pitch_nynyny") || analysis.pitch.version === ref.pitch.version,
          nextStep: analysis.nextStep.type === ref.nextStep.type,
          callType: analysis.callType === ref.callType,
          objections: jaccard(analysis.objections.map((o) => o.category), ref.objections.map((o) => o.category)),
          phasesPresent: presentAgree,
          phaseQuality: qualityAgree,
          warnings: warnings.length,
          items,
          costUsd,
          moments: [analysis.moments.length, ref.moments.length],
        });
        console.log(
          `${g.callRecordingId} score ${scores.overall ?? "–"} (Opus ${refScores.overall ?? "–"}) · pitch ${analysis.pitch.version}/${ref.pitch.version} · citat-advarsler ${warnings.length} · $${costUsd.toFixed(4)}`,
        );
      } catch (err) {
        console.log(`FEJL ${g.callRecordingId}: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const n = rows.length;
  const avg = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0) / n;
  const deltas = rows.flatMap((r) => (r.overallDelta === null ? [] : [Math.abs(r.overallDelta)]));
  console.log(`\n=== ${model}${effort ? ` (effort ${effort})` : ""} mod Opus (guldsæt, ${n} samtaler) ===`);
  console.log(`Score: gns. afvigelse ${(deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1)).toFixed(1)} point (maks ${Math.max(0, ...deltas)})`);
  console.log(`Samme pitch ${(avg((r) => +r.pitch) * 100).toFixed(0)} % · samme næste skridt ${(avg((r) => +r.nextStep) * 100).toFixed(0)} % · samme samtaletype ${(avg((r) => +r.callType) * 100).toFixed(0)} %`);
  console.log(`Indvendinger (overlap) ${(avg((r) => r.objections) * 100).toFixed(0)} % · faser til stede ${(avg((r) => r.phasesPresent) * 100).toFixed(0)} % · fasekvalitet ens ${(avg((r) => r.phaseQuality) * 100).toFixed(0)} %`);
  console.log(`Citat-advarsler: ${rows.reduce((s, r) => s + r.warnings, 0)} af ${rows.reduce((s, r) => s + r.items + r.warnings, 0)} fund · øjeblikke gns. ${avg((r) => r.moments[0]).toFixed(1)} (Opus ${avg((r) => r.moments[1]).toFixed(1)})`);
  console.log(`Pris: $${rows.reduce((s, r) => s + r.costUsd, 0).toFixed(4)} i alt · $${avg((r) => r.costUsd).toFixed(4)} pr. samtale`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

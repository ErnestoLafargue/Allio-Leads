/**
 * Transskriberer CallRecordings med status NEW via Soniox (lib/call-transcription) i prioriteret
 * rækkefølge: (a) samtaler med udfald og ≥ 60 s, (b) øvrige ≥ 60 s, (c) resten.
 * Stopper før Soniox-budgettet overskrides (forbrug logges pr. samtale i CallTranscript.costUsd).
 *
 * Brug:
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/transcribe-calls.ts [--limit 20] [--concurrency 3] [--retry-failed]
 *
 * Budget: SONIOX_BUDGET_USD (standard 5) inkl. SONIOX_PRIOR_SPEND_USD (forbrug uden for DB, fx test).
 */
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { SONIOX_USD_PER_HOUR } from "@/lib/call-transcription/soniox";
import { transcribeCallRecording } from "@/lib/call-transcription/transcribe-call";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function priority(r: { outcomeStatus: string | null; durationSeconds: number }): number {
  if (r.durationSeconds >= 60 && r.outcomeStatus) return 0;
  if (r.durationSeconds >= 60) return 1;
  return 2;
}

async function main() {
  assertExpectedDatabase();
  const telnyxApiKey = process.env.TELNYX_API_KEY?.trim();
  const sonioxApiKey = process.env.SONIOX_API_KEY?.trim();
  if (!telnyxApiKey || !sonioxApiKey) throw new Error("TELNYX_API_KEY og SONIOX_API_KEY skal være sat.");

  const budget = Number(process.env.SONIOX_BUDGET_USD ?? 5);
  const priorSpend = Number(process.env.SONIOX_PRIOR_SPEND_USD ?? 0.15);
  const limit = Number(arg("--limit") ?? Infinity);
  const concurrency = Number(arg("--concurrency") ?? 3);
  const statuses = process.argv.includes("--retry-failed") ? ["NEW", "FAILED"] : ["NEW"];

  const spent = await prisma.callTranscript.aggregate({ _sum: { costUsd: true } });
  let spend = priorSpend + (spent._sum.costUsd ?? 0);
  const todo = (
    await prisma.callRecording.findMany({
      where: { pipelineStatus: { in: statuses } },
      select: { id: true, durationSeconds: true, outcomeStatus: true, channels: true },
    })
  )
    .sort((a, b) => priority(a) - priority(b) || b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
  console.log(`${todo.length} samtaler i kø · Soniox-forbrug indtil nu $${spend.toFixed(2)} af $${budget}`);

  let next = 0;
  let done = 0;
  let stopped = false;
  const counts: Record<string, number> = {};
  const worker = async () => {
    while (!stopped && next < todo.length) {
      const call = todo[next++]!;
      const estimate = (call.durationSeconds / 3600) * SONIOX_USD_PER_HOUR * (call.channels === "dual" ? 2 : 1);
      if (spend + estimate > budget) {
        stopped = true;
        console.log(`Stopper: næste samtale ville overskride budgettet ($${spend.toFixed(2)} brugt).`);
        return;
      }
      spend += estimate;
      try {
        const r = await transcribeCallRecording(call.id, { telnyxApiKey, sonioxApiKey });
        spend += r.costUsd - estimate;
        counts[r.status] = (counts[r.status] ?? 0) + 1;
        done += 1;
        console.log(
          `${String(done).padStart(4)}/${todo.length} ${call.id} p${priority(call)} ${r.mode} ${r.status} ` +
            `${r.words} ord $${r.costUsd.toFixed(4)} (i alt $${spend.toFixed(2)})`,
        );
      } catch (err) {
        spend -= estimate;
        const message = err instanceof Error ? err.message : String(err);
        counts.FAILED = (counts.FAILED ?? 0) + 1;
        await prisma.callRecording.update({
          where: { id: call.id },
          data: { pipelineStatus: "FAILED", pipelineError: message.slice(0, 500) },
        });
        console.log(`FEJL ${call.id}: ${message.slice(0, 200)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  console.log(`Færdig: ${JSON.stringify(counts)} · Soniox i alt $${spend.toFixed(2)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

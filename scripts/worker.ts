/**
 * Workeren for «Scripts & Træning»: holder nye samtaler opdateret uden en åben Claude-session.
 * Hver runde:
 *   1. Afstemning: importerer nye Telnyx-optagelser (de seneste døgn) og kobler dem.
 *   2. Transskribering: samtaler med status NEW → Soniox.
 *   3. Analyse: samtaler med status TRANSCRIBED → Claude API (samme prompt og skema som sessionen).
 *   4. Ugens script: genereres og udgives automatisk, når der ikke findes et for indeværende uge.
 * Forbrugsloft pr. måned for Soniox og Claude; fejl markeres FAILED (prøv igen med --retry-failed).
 *
 * Køres manuelt (ingen systemd/cron endnu):
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/worker.ts --once [--analyze-limit 5] [--analyze-ids a,b] [--no-weekly]
 * Uden --once kører den i løkke med --interval-min (standard 5).
 */
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { importCallRecordings } from "@/lib/call-recording-import";
import { analyzeCallViaApi } from "@/lib/call-analysis/api";
import { transcribeCallRecording } from "@/lib/call-transcription/transcribe-call";
import { generateWeeklyScriptViaApi } from "@/lib/sales-scripts/generate";
import { isoWeekKey } from "@/lib/sales-scripts/publish";
import { MIN_GROUP } from "@/lib/scripts-traening/insights";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const has = (flag: string) => process.argv.includes(flag);
const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function claudeSpentThisMonth(): Promise<number> {
  const since = monthStart();
  const [analyses, scripts] = await Promise.all([
    prisma.callAnalysis.aggregate({ where: { source: "api", createdAt: { gte: since } }, _sum: { costUsd: true } }),
    prisma.salesScriptVersion.aggregate({ where: { generatedBy: "api", createdAt: { gte: since } }, _sum: { costUsd: true } }),
  ]);
  return (analyses._sum.costUsd ?? 0) + (scripts._sum.costUsd ?? 0);
}

async function sonioxSpentThisMonth(): Promise<number> {
  const r = await prisma.callTranscript.aggregate({ where: { createdAt: { gte: monthStart() } }, _sum: { costUsd: true } });
  return r._sum.costUsd ?? 0;
}

async function markFailed(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.callRecording.update({ where: { id }, data: { pipelineStatus: "FAILED", pipelineError: message.slice(0, 500) } });
  log(`FEJL ${id}: ${message.slice(0, 200)}`);
}

async function runOnce(opts: {
  telnyxApiKey: string;
  sonioxApiKey: string;
  claudeBudget: number;
  sonioxBudget: number;
  analyzeLimit: number;
  transcribeLimit: number;
  analyzeIds: string[] | null;
  weekly: boolean;
}) {
  if (!opts.analyzeIds) {
    const imported = await importCallRecordings({
      apiKey: opts.telnyxApiKey,
      fromIso: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    });
    log(`Afstemning: ${imported.fetched} optagelser, ${imported.created} nye`);

    const statuses = has("--retry-failed") ? ["NEW", "FAILED"] : ["NEW"];
    const toTranscribe = await prisma.callRecording.findMany({
      where: { pipelineStatus: { in: statuses }, transcript: null },
      orderBy: { startedAt: "desc" },
      take: opts.transcribeLimit,
      select: { id: true },
    });
    for (const { id } of toTranscribe) {
      if ((await sonioxSpentThisMonth()) >= opts.sonioxBudget) {
        log(`Soniox-loftet på $${opts.sonioxBudget} er nået — stopper transskribering.`);
        break;
      }
      try {
        const r = await transcribeCallRecording(id, { telnyxApiKey: opts.telnyxApiKey, sonioxApiKey: opts.sonioxApiKey });
        log(`Transskriberet ${id}: ${r.status}, ${r.words} ord, $${r.costUsd.toFixed(4)}`);
      } catch (err) {
        await markFailed(id, err);
      }
    }
  }

  const toAnalyze = opts.analyzeIds
    ? opts.analyzeIds
    : (
        await prisma.callRecording.findMany({
          where: { pipelineStatus: "TRANSCRIBED" },
          orderBy: { startedAt: "desc" },
          take: opts.analyzeLimit,
          select: { id: true },
        })
      ).map((r) => r.id);
  for (const id of toAnalyze) {
    const spent = await claudeSpentThisMonth();
    if (spent >= opts.claudeBudget) {
      log(`Claude-loftet på $${opts.claudeBudget} er nået ($${spent.toFixed(2)}) — stopper analyse.`);
      break;
    }
    try {
      const r = await analyzeCallViaApi(id);
      log(`Analyseret ${id}: score ${r.overall ?? "–"}, ${r.warnings.length} advarsler, $${r.costUsd.toFixed(4)} (${r.model})`);
    } catch (err) {
      await markFailed(id, err);
    }
  }

  if (opts.weekly) {
    const week = isoWeekKey(new Date());
    const exists = await prisma.salesScriptVersion.findFirst({ where: { kind: "WEEKLY", weekKey: week } });
    const analyzed = await prisma.callAnalysis.count();
    if (!exists && analyzed >= MIN_GROUP && (await claudeSpentThisMonth()) < opts.claudeBudget) {
      const r = await generateWeeklyScriptViaApi();
      log(`Ugens script (${week}) udgivet som version ${r.version} — $${r.costUsd.toFixed(4)}`);
    }
  }
}

async function main() {
  assertExpectedDatabase();
  const telnyxApiKey = process.env.TELNYX_API_KEY?.trim();
  const sonioxApiKey = process.env.SONIOX_API_KEY?.trim();
  if (!telnyxApiKey || !sonioxApiKey || !process.env.ANTHROPIC_API_KEY) {
    throw new Error("TELNYX_API_KEY, SONIOX_API_KEY og ANTHROPIC_API_KEY skal være sat.");
  }
  const opts = {
    telnyxApiKey,
    sonioxApiKey,
    claudeBudget: Number(process.env.CLAUDE_MONTHLY_BUDGET_USD ?? 5),
    sonioxBudget: Number(process.env.SONIOX_MONTHLY_BUDGET_USD ?? 5),
    analyzeLimit: Number(arg("--analyze-limit") ?? 5),
    transcribeLimit: Number(arg("--transcribe-limit") ?? 20),
    analyzeIds: arg("--analyze-ids")?.split(",").filter(Boolean) ?? null,
    weekly: !has("--no-weekly"),
  };
  const intervalMs = Number(arg("--interval-min") ?? 5) * 60 * 1000;
  for (;;) {
    await runOnce(opts);
    if (has("--once")) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Kopierer «Scripts & Træning»-data fra Neon-branchen (kilde: DATABASE_URL) til en måldatabase
 * (TARGET_DATABASE_URL), så historikkens transskriptioner og analyser ikke skal laves og betales igen:
 * CallRecording, CallTranscript, CallAnalysis og SalesScriptVersion.
 *
 * Ved deploy: kør migrationerne på målet først, og kør kopien, før workeren startes mod målet.
 * Tørkørsel som standard — --apply skriver. Målet skal bekræftes med --target-host.
 *
 * Brug:
 *   set -a; . ./.env.local; . ./.env.branch; set +a
 *   TARGET_DATABASE_URL='postgresql://…' npx tsx --tsconfig tsconfig.json scripts/copy-scripts-traening-data.ts \
 *     --target-host <host fra TARGET_DATABASE_URL> [--apply]
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { planRecordingCopy } from "@/lib/call-recording-copy";
import { INITIAL_PIPELINE_STATUSES } from "@/lib/call-recording-linking";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

const json = (v: Prisma.JsonValue) => v as Prisma.InputJsonValue;
const jsonOrNull = (v: Prisma.JsonValue | null) => (v === null ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))];

async function main() {
  assertExpectedDatabase();
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!targetUrl) throw new Error("TARGET_DATABASE_URL mangler.");
  const targetHost = new URL(targetUrl).hostname;
  if (arg("--target-host") !== targetHost) throw new Error(`Bekræft målet med --target-host ${targetHost}`);
  const apply = process.argv.includes("--apply");
  if (apply && targetHost === new URL(process.env.DATABASE_URL ?? "").hostname) {
    throw new Error("Kilde og mål er den samme database.");
  }

  const source = new PrismaClient();
  const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const recordings = await source.callRecording.findMany();
    const [targetRecs, users, leads, campaigns] = await Promise.all([
      target.callRecording.findMany({
        select: { id: true, telnyxRecordingId: true, pipelineStatus: true, transcript: { select: { id: true } } },
      }),
      target.user.findMany({ where: { id: { in: uniq(recordings.map((r) => r.agentUserId)) } }, select: { id: true } }),
      target.lead.findMany({ where: { id: { in: uniq(recordings.map((r) => r.leadId)) } }, select: { id: true } }),
      target.campaign.findMany({ where: { id: { in: uniq(recordings.map((r) => r.campaignId)) } }, select: { id: true } }),
    ]);
    const plan = planRecordingCopy(
      recordings,
      targetRecs.map((t) => ({ ...t, hasTranscript: t.transcript !== null })),
      {
        userIds: new Set(users.map((u) => u.id)),
        leadIds: new Set(leads.map((l) => l.id)),
        campaignIds: new Set(campaigns.map((c) => c.id)),
      },
    );
    const transcripts = (await source.callTranscript.findMany()).filter((t) =>
      plan.carry.has(t.callRecordingId),
    );
    const analyses = (await source.callAnalysis.findMany()).filter((a) => plan.carry.has(a.callRecordingId));
    const scripts = await source.salesScriptVersion.findMany({ orderBy: [{ kind: "asc" }, { version: "asc" }] });
    const targetHasActiveWeekly = (await target.salesScriptVersion.count({ where: { kind: "WEEKLY", isActive: true } })) > 0;

    console.log(`Mål: ${targetHost}${apply ? "" : " (tørkørsel)"}`);
    console.log(
      `Optagelser: ${recordings.length} i kilden · ${plan.create.length} nye · ` +
        `${[...plan.statusUpdates.values()].reduce((n, ids) => n + ids.length, 0)} får status løftet · ` +
        `${plan.skipped} allerede transskriberet i målet (springes over)`,
    );
    console.log(`Fremmednøgler sat til null: ${JSON.stringify(plan.nulled)}`);
    console.log(`Transskriptioner: ${transcripts.length} · analyser: ${analyses.length} · scriptversioner: ${scripts.length}`);
    if (!apply) {
      console.log("Intet skrevet. Tilføj --apply for at kopiere.");
      return;
    }

    for (const part of chunks(plan.create, 200)) {
      await target.callRecording.createMany({ data: part, skipDuplicates: true });
    }
    for (const [status, ids] of plan.statusUpdates) {
      for (const part of chunks(ids, 500)) {
        await target.callRecording.updateMany({
          where: { telnyxRecordingId: { in: part }, pipelineStatus: { in: [...INITIAL_PIPELINE_STATUSES] } },
          data: { pipelineStatus: status, pipelineError: null },
        });
      }
    }
    let copiedTranscripts = 0;
    for (const part of chunks(transcripts, 50)) {
      const r = await target.callTranscript.createMany({
        data: part.map((t) => ({
          ...t,
          callRecordingId: plan.carry.get(t.callRecordingId)!,
          languages: jsonOrNull(t.languages),
          segments: json(t.segments),
        })),
        skipDuplicates: true,
      });
      copiedTranscripts += r.count;
    }
    let copiedAnalyses = 0;
    for (const part of chunks(analyses, 100)) {
      const r = await target.callAnalysis.createMany({
        data: part.map((a) => ({
          ...a,
          callRecordingId: plan.carry.get(a.callRecordingId)!,
          result: json(a.result),
          scores: json(a.scores),
          warnings: jsonOrNull(a.warnings),
        })),
        skipDuplicates: true,
      });
      copiedAnalyses += r.count;
    }
    const copiedScripts = await target.salesScriptVersion.createMany({
      data: scripts.map((s) => ({
        ...s,
        content: json(s.content),
        evidence: jsonOrNull(s.evidence),
        isActive: s.kind === "WEEKLY" && targetHasActiveWeekly ? false : s.isActive,
      })),
      skipDuplicates: true,
    });
    console.log(
      `Kopieret: ${copiedTranscripts} transskriptioner, ${copiedAnalyses} analyser, ${copiedScripts.count} scriptversioner.`,
    );
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

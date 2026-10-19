/**
 * Sætter manglende sælger på CALL_RECORDING-aktiviteter og henter lydfiler,
 * som allerede ligger i CallRecording-kataloget, ind på Lydfiler.
 *
 *   set -a; . ./.env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/materialize-missing-recordings.ts [--days 35] [--concurrency 3]
 */
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND, formatPhoneForActivitySummary } from "@/lib/lead-activity-kinds";
import { persistTelnyxRecordingToAllio } from "@/lib/telnyx-recording-storage";
import { isVercelBlobUrl } from "@/lib/telnyx-recordings-backfill";
import { resolveFreshTelnyxMp3Url } from "@/lib/telnyx-recording-recover";

const MIN_SECONDS = 12;

function argNumber(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function durationLabel(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

async function stampMissingAgents(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "LeadActivityEvent" e
    SET "userId" = sub."agentUserId"
    FROM (
      SELECT DISTINCT ON (e2.id)
        e2.id,
        r."agentUserId"
      FROM "LeadActivityEvent" e2
      JOIN "CallRecording" r
        ON r."agentUserId" IS NOT NULL
       AND (
            r."activityEventId" = e2.id
         OR e2."telnyxCallLegId" = 'rec:' || r."telnyxRecordingId"
         OR (
              r."telnyxCallControlId" IS NOT NULL
          AND r."telnyxCallControlId" <> ''
          AND e2."telnyxCallLegId" = r."telnyxCallControlId"
         )
       )
      WHERE e2.kind = 'CALL_RECORDING'
        AND e2."userId" IS NULL
      ORDER BY e2.id,
        CASE
          WHEN r."activityEventId" = e2.id THEN 0
          WHEN e2."telnyxCallLegId" = 'rec:' || r."telnyxRecordingId" THEN 1
          ELSE 2
        END,
        r."startedAt" DESC
    ) sub
    WHERE e.id = sub.id
  `;
}

type CatalogRow = {
  id: string;
  telnyxRecordingId: string;
  telnyxCallControlId: string | null;
  leadId: string | null;
  agentUserId: string | null;
  durationSeconds: number;
  startedAt: Date;
  activityEventId: string | null;
};

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function main() {
  const days = argNumber("--days", 35);
  const concurrency = Math.min(6, argNumber("--concurrency", 3));
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    console.error("TELNYX_API_KEY mangler.");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.error("BLOB_READ_WRITE_TOKEN mangler.");
    process.exit(1);
  }

  const stamped = await stampMissingAgents();
  console.log(`Sælger sat på ${stamped} eksisterende lydfiler.`);

  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.callRecording.findMany({
    where: {
      leadId: { not: null },
      durationSeconds: { gte: MIN_SECONDS },
      startedAt: { gte: since },
      pipelineStatus: { not: "SKIPPED_DUPLICATE" },
      OR: [{ playbackUrl: null }, { playbackUrl: "" }],
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      telnyxRecordingId: true,
      telnyxCallControlId: true,
      leadId: true,
      agentUserId: true,
      durationSeconds: true,
      startedAt: true,
      activityEventId: true,
    },
  });
  console.log(`Henter ${rows.length} manglende lydfiler siden ${since.toISOString().slice(0, 10)}.`);

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.agentUserId).filter((id): id is string => Boolean(id)))] } },
    select: { id: true, name: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const leads = await prisma.lead.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.leadId).filter((id): id is string => Boolean(id)))] } },
    select: { id: true, phone: true },
  });
  const phoneByLead = new Map(leads.map((l) => [l.id, l.phone]));

  let linked = 0;
  let copied = 0;
  let missing = 0;
  let failed = 0;

  await mapPool(rows, concurrency, async (row) => {
    try {
      const outcome = await materializeOne(row, apiKey, nameById, phoneByLead);
      if (outcome === "linked") linked += 1;
      else if (outcome === "copied") copied += 1;
      else missing += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `fejl ${row.telnyxRecordingId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const done = linked + copied + missing + failed;
    if (done % 25 === 0) {
      console.log(`  ${done}/${rows.length}  kopieret=${copied}  allerede=${linked}  mangler=${missing}  fejl=${failed}`);
    }
  });

  console.log(
    `Færdig. kopieret=${copied} allerede_fil=${linked} ikke_hos_telnyx=${missing} fejl=${failed}`,
  );
}

async function materializeOne(
  row: CatalogRow,
  apiKey: string,
  nameById: Map<string, string>,
  phoneByLead: Map<string, string>,
): Promise<"linked" | "copied" | "missing"> {
  const leadId = row.leadId;
  if (!leadId) return "missing";
  const legIds = [`rec:${row.telnyxRecordingId}`];
  if (row.telnyxCallControlId) legIds.push(row.telnyxCallControlId);

  const existing = await prisma.leadActivityEvent.findFirst({
    where: {
      leadId,
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      OR: [
        ...(row.activityEventId ? [{ id: row.activityEventId }] : []),
        { telnyxCallLegId: { in: legIds } },
      ],
    },
    select: { id: true, recordingUrl: true, userId: true, durationSeconds: true },
  });

  if (existing?.recordingUrl && isVercelBlobUrl(existing.recordingUrl)) {
    if (row.agentUserId && existing.userId !== row.agentUserId) {
      await prisma.leadActivityEvent.update({
        where: { id: existing.id },
        data: { userId: row.agentUserId },
      });
    }
    await prisma.callRecording.update({
      where: { id: row.id },
      data: { playbackUrl: existing.recordingUrl, activityEventId: existing.id },
    });
    return "linked";
  }

  const fresh = await resolveFreshTelnyxMp3Url({
    apiKey,
    telnyxCallLegId: `rec:${row.telnyxRecordingId}`,
  });
  if (!fresh?.mp3Url) return "missing";

  const persisted = await persistTelnyxRecordingToAllio({
    telnyxMp3Url: fresh.mp3Url,
    leadId,
    callControlId: fresh.callControlId || row.telnyxCallControlId || `rec_${row.telnyxRecordingId}`,
  });
  if (!persisted.storedOnAllio || !isVercelBlobUrl(persisted.playbackUrl)) return "missing";

  const phone = phoneByLead.get(leadId);
  const agentName = row.agentUserId ? nameById.get(row.agentUserId) : null;
  const summary = [
    agentName ? `${agentName} talte med leadet` : "Samtale optaget",
    phone ? `(${formatPhoneForActivitySummary(phone)})` : "",
    `— varighed ${durationLabel(row.durationSeconds)}`,
  ]
    .filter(Boolean)
    .join(" ");

  const eventId = existing
    ? (
        await prisma.leadActivityEvent.update({
          where: { id: existing.id },
          data: {
            userId: row.agentUserId ?? existing.userId,
            recordingUrl: persisted.playbackUrl,
            durationSeconds: row.durationSeconds,
            summary,
          },
          select: { id: true },
        })
      ).id
    : (
        await prisma.leadActivityEvent.create({
          data: {
            leadId,
            userId: row.agentUserId,
            kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
            summary,
            recordingUrl: persisted.playbackUrl,
            durationSeconds: row.durationSeconds,
            telnyxCallLegId: row.telnyxCallControlId || `rec:${row.telnyxRecordingId}`,
            createdAt: row.startedAt,
          },
          select: { id: true },
        })
      ).id;

  await prisma.callRecording.update({
    where: { id: row.id },
    data: { playbackUrl: persisted.playbackUrl, activityEventId: eventId },
  });
  return "copied";
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

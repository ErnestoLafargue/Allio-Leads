/**
 * Henter ALLE Telnyx-optagelser (pagineret) og kopierer dem til Vercel Blob,
 * plus migrerer eksisterende CALL_RECORDING-rækker der stadig peger på Telnyx/S3.
 *
 * Brug:
 *   set -a; . ./.env.local; set +a
 *   npx tsx --tsconfig tsconfig.json scripts/backfill-all-telnyx-recordings.ts
 *
 * Kræver TELNYX_API_KEY, DATABASE_URL og (anbefalet) BLOB_READ_WRITE_TOKEN.
 */
import { prisma } from "@/lib/prisma";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";
import {
  isVercelBlobUrl,
  runRecordingsBackfill,
  type BackfillStats,
} from "@/lib/telnyx-recordings-backfill";
import { persistTelnyxRecordingToAllio } from "@/lib/telnyx-recording-storage";

function emptyTotals(): BackfillStats & { invocations: number } {
  return {
    invocations: 0,
    scanned: 0,
    matched: 0,
    created: 0,
    updated: 0,
    copiedToBlob: 0,
    uncoupled: 0,
    errors: [],
  };
}

function merge(into: ReturnType<typeof emptyTotals>, next: BackfillStats) {
  into.invocations += 1;
  into.scanned += next.scanned;
  into.matched += next.matched;
  into.created += next.created;
  into.updated += next.updated;
  into.copiedToBlob += next.copiedToBlob;
  into.uncoupled += next.uncoupled;
  into.errors.push(...next.errors);
}

async function migrateNonBlobRecordings() {
  const rows = await prisma.leadActivityEvent.findMany({
    where: {
      kind: LEAD_ACTIVITY_KIND.CALL_RECORDING,
      recordingUrl: { not: null },
    },
    select: {
      id: true,
      leadId: true,
      recordingUrl: true,
      telnyxCallLegId: true,
    },
  });

  let skippedBlob = 0;
  let migrated = 0;
  let failed = 0;

  for (const row of rows) {
    const url = row.recordingUrl?.trim();
    if (!url) continue;
    if (isVercelBlobUrl(url)) {
      skippedBlob += 1;
      continue;
    }

    try {
      const { playbackUrl, storedOnAllio } = await persistTelnyxRecordingToAllio({
        telnyxMp3Url: url,
        leadId: row.leadId,
        callControlId: row.telnyxCallLegId || `event_${row.id}`,
      });
      if (!storedOnAllio || playbackUrl === url) {
        failed += 1;
        console.warn(`  migrate skip (kunne ikke kopiere): ${row.id}`);
        continue;
      }
      await prisma.leadActivityEvent.update({
        where: { id: row.id },
        data: { recordingUrl: playbackUrl },
      });
      if (row.telnyxCallLegId) {
        await prisma.dialerCallLog.updateMany({
          where: { callControlId: row.telnyxCallLegId },
          data: { recordingUrl: playbackUrl },
        });
      }
      migrated += 1;
      console.log(`  migreret ${row.id} → Blob`);
    } catch (err) {
      failed += 1;
      console.warn(
        `  migrate fejl ${row.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { total: rows.length, skippedBlob, migrated, failed };
}

async function main() {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    console.error("TELNYX_API_KEY mangler i miljøet.");
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    console.warn(
      "Advarsel: BLOB_READ_WRITE_TOKEN mangler — optagelser gemmes kun som Telnyx-URL'er.",
    );
  }

  const totals = emptyTotals();
  let startPage = 1;
  const pageSize = 100;
  const maxPages = 5;

  console.log("=== Telnyx recordings backfill (alle sider) ===");
  for (;;) {
    console.log(`\nInvocation #${totals.invocations + 1} — startPage=${startPage}`);
    const out = await runRecordingsBackfill({
      apiKey,
      startPage,
      pageSize,
      maxPages,
      copyToBlob: true,
      dryRun: false,
    });
    if (!out.ok) {
      console.error("Backfill fejlede:", out.status, out.message);
      process.exit(1);
    }
    merge(totals, out.result.stats);
    console.log(
      `  pages=${out.result.pagesProcessed} scanned=${out.result.stats.scanned} ` +
        `created=${out.result.stats.created} updated=${out.result.stats.updated} ` +
        `copied=${out.result.stats.copiedToBlob} uncoupled=${out.result.stats.uncoupled}`,
    );
    if (out.result.nextPage == null) break;
    startPage = out.result.nextPage;
  }

  console.log("\n=== Migrér CALL_RECORDING uden Blob-URL ===");
  const mig = await migrateNonBlobRecordings();
  console.log(
    `  total=${mig.total} alleredeBlob=${mig.skippedBlob} migreret=${mig.migrated} fejlet=${mig.failed}`,
  );

  console.log("\n=== Samlet ===");
  console.log({
    invocations: totals.invocations,
    scanned: totals.scanned,
    matched: totals.matched,
    created: totals.created,
    updated: totals.updated,
    copiedToBlob: totals.copiedToBlob,
    uncoupled: totals.uncoupled,
    errorCount: totals.errors.length,
    migrate: mig,
  });
  if (totals.errors.length) {
    console.log("Seneste fejl:", totals.errors.slice(-10));
  }

  await prisma.$disconnect();
}

void main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

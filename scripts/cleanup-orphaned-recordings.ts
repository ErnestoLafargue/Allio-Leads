/**
 * Sletter forældreløse lydfiler i Vercel Blob (call-recordings/) — filer som
 * hverken er refereret i LeadActivityEvent.recordingUrl eller
 * DialerCallLog.recordingUrl. Dubletterne opstod fordi Telnyx-synken tidligere
 * genuploadede eksisterende optagelser med nyt filnavn.
 *
 * Brug:
 *   npx tsx scripts/cleanup-orphaned-recordings.ts            (dry-run: viser kun hvad der ville slettes)
 *   npx tsx scripts/cleanup-orphaned-recordings.ts --delete   (sletter)
 *
 * Kræver BLOB_READ_WRITE_TOKEN og DATABASE_URL i miljøet.
 */
import { del, list } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

const DRY_RUN = !process.argv.includes("--delete");
const PREFIX = "call-recordings/";

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    console.error("BLOB_READ_WRITE_TOKEN mangler i miljøet.");
    process.exit(1);
  }

  // 1) Saml alle blob-pathnames der stadig er i brug i databasen.
  const [events, callLogs] = await Promise.all([
    prisma.leadActivityEvent.findMany({
      where: { recordingUrl: { contains: ".blob.vercel-storage.com/" } },
      select: { recordingUrl: true },
    }),
    prisma.dialerCallLog.findMany({
      where: { recordingUrl: { contains: ".blob.vercel-storage.com/" } },
      select: { recordingUrl: true },
    }),
  ]);

  // Match på fuld URL: put() gemmer URL'en med tilfældigt suffiks i DB, og
  // list() returnerer samme URL pr. blob (pathname er derimod uden suffiks).
  const referenced = new Set<string>();
  for (const row of [...events, ...callLogs]) {
    const url = row.recordingUrl?.trim();
    if (url) referenced.add(url);
  }
  console.log(`Refererede lydfiler i DB: ${referenced.size}`);

  // 2) List alle blobs under call-recordings/ og find de forældreløse.
  let cursor: string | undefined;
  let totalFiles = 0;
  let totalBytes = 0;
  const orphans: { pathname: string; url: string; size: number }[] = [];

  do {
    const page = await list({ token, prefix: PREFIX, cursor, limit: 1000 });
    for (const blob of page.blobs) {
      totalFiles += 1;
      totalBytes += blob.size;
      if (!referenced.has(blob.url)) {
        orphans.push({ pathname: blob.pathname, url: blob.url, size: blob.size });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const orphanBytes = orphans.reduce((sum, o) => sum + o.size, 0);
  console.log(
    `Blob-filer i alt: ${totalFiles} (${(totalBytes / 1024 / 1024).toFixed(1)} MB) — forældreløse: ${orphans.length} (${(orphanBytes / 1024 / 1024).toFixed(1)} MB)`,
  );

  if (orphans.length === 0) {
    console.log("Intet at rydde op.");
    return;
  }

  if (DRY_RUN) {
    for (const o of orphans.slice(0, 20)) {
      console.log(`  ville slette: ${o.pathname} (${(o.size / 1024).toFixed(0)} KB)`);
    }
    if (orphans.length > 20) console.log(`  … og ${orphans.length - 20} flere`);
    console.log("\nDry-run — kør igen med --delete for at slette.");
    return;
  }

  // 3) Slet i batches.
  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += BATCH) {
    const batch = orphans.slice(i, i + BATCH);
    await del(batch.map((o) => o.url), { token });
    deleted += batch.length;
    console.log(`Slettet ${deleted}/${orphans.length}…`);
  }
  console.log(
    `Færdig: ${deleted} forældreløse lydfiler slettet (${(orphanBytes / 1024 / 1024).toFixed(1)} MB frigivet).`,
  );
}

main()
  .catch((err) => {
    console.error("Fejl:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());

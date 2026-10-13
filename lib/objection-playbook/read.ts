/**
 * Den aktive indvendingsbog — til siden «Indvendinger», live-coachen og øve-tilstanden.
 */
import { prisma } from "@/lib/prisma";
import { PLAYBOOK_KIND, type PlaybookEntry, type PlaybookStats } from "./schema";

export async function activePlaybook(): Promise<{ entries: PlaybookEntry[]; stats: PlaybookStats; version: number; publishedAt: Date | null } | null> {
  const row = await prisma.salesScriptVersion.findFirst({
    where: { kind: PLAYBOOK_KIND, isActive: true },
    select: { content: true, evidence: true, version: true, publishedAt: true },
  });
  if (!row) return null;
  return { entries: row.content as unknown as PlaybookEntry[], stats: row.evidence as unknown as PlaybookStats, version: row.version, publishedAt: row.publishedAt };
}

let cache: { at: number; text: string } | null = null;

/** Skabelonerne som tekst til live-coachens systemprompt (caches 1 time). */
export async function playbookTemplatesText(): Promise<string> {
  if (cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.text;
  const book = await activePlaybook();
  const text = (book?.entries ?? [])
    .map((e) => `- ${e.title} [${e.category}, træk: ${e.move}]\n  Skabelon: ${e.template}\n  Princip: ${e.principle}`)
    .join("\n");
  cache = { at: Date.now(), text };
  return text;
}

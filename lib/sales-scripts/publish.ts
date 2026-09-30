/**
 * Udgivelse og tilbagerulning af ugens script. Nyt script udgives automatisk og bliver aktivt;
 * tidligere versioner bevares, så en admin kan rulle tilbage.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WeeklyScriptSchema, type WeeklyScript } from "./schema";

/** ISO-uge, fx "2026-W39". */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Validerer modeloutputtet og fjerner henvisninger til samtaler, der ikke står i evidenspakken. */
export function sanitizeWeeklyScript(raw: unknown, allowedCallIds: ReadonlySet<string>): WeeklyScript {
  const script = WeeklyScriptSchema.parse(raw);
  const keep = (ids: string[]) => ids.filter((id) => allowedCallIds.has(id)).slice(0, 3);
  return {
    ...script,
    sections: script.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, evidenceCalls: keep(l.evidenceCalls) })) })),
    objections: script.objections.map((o) => ({ ...o, evidenceCalls: keep(o.evidenceCalls) })),
  };
}

export async function publishWeeklyScript(input: {
  script: WeeklyScript;
  evidence: unknown;
  basedOnCalls: number;
  generatedBy: "session" | "api";
  promptVersion: string;
  costUsd?: number;
  now?: Date;
}): Promise<{ id: string; version: number }> {
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const last = await tx.salesScriptVersion.findFirst({ where: { kind: "WEEKLY" }, orderBy: { version: "desc" }, select: { version: true } });
    await tx.salesScriptVersion.updateMany({ where: { kind: "WEEKLY", isActive: true }, data: { isActive: false } });
    const created = await tx.salesScriptVersion.create({
      data: {
        kind: "WEEKLY",
        name: input.script.title,
        version: (last?.version ?? 0) + 1,
        weekKey: isoWeekKey(now),
        content: input.script as unknown as Prisma.InputJsonValue,
        evidence: input.evidence as Prisma.InputJsonValue,
        basedOnCalls: input.basedOnCalls,
        isActive: true,
        generatedBy: input.generatedBy,
        promptVersion: input.promptVersion,
        costUsd: input.costUsd ?? 0,
        publishedAt: now,
      },
      select: { id: true, version: true },
    });
    return created;
  });
}

/** Gør en tidligere version aktiv igen; den hidtil aktive markeres som rullet tilbage. */
export async function rollbackWeeklyScript(targetId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.salesScriptVersion.findFirst({ where: { id: targetId, kind: "WEEKLY" }, select: { id: true } });
    if (!target) throw new Error("Scriptversionen findes ikke.");
    await tx.salesScriptVersion.updateMany({
      where: { kind: "WEEKLY", isActive: true, NOT: { id: targetId } },
      data: { isActive: false, rolledBackAt: new Date() },
    });
    await tx.salesScriptVersion.update({ where: { id: targetId }, data: { isActive: true, rolledBackAt: null } });
  });
}

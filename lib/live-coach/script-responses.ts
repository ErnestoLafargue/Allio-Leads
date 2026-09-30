/**
 * Svarene på indvendinger fra det aktive «ugens script» — grundlaget for live-coachens kort.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";
import type { WeeklyScript } from "@/lib/sales-scripts/schema";

export async function activeScriptResponses(): Promise<Partial<Record<ObjectionCategory, string>>> {
  const active = await prisma.salesScriptVersion.findFirst({
    where: { kind: "WEEKLY", isActive: true },
    select: { content: true },
  });
  const script = active?.content as unknown as WeeklyScript | undefined;
  const out: Partial<Record<ObjectionCategory, string>> = {};
  for (const o of script?.objections ?? []) if (o.response && !out[o.category]) out[o.category] = o.response;
  return out;
}

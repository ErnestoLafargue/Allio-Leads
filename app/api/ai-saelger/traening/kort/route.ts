import { NextResponse } from "next/server";
import { ALL_SITUATIONS, isSituation, situationLabel } from "@/lib/ai-saelger/training";
import { customerLineFor } from "@/lib/ai-saelger/training-db";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { objectionBank } from "@/lib/live-coach/script-responses";
import { getViewer } from "@/lib/scripts-traening/queries";

/**
 * POST /api/ai-saelger/traening/kort { situation? } — et kort til «Træn Adrian»: kundens replik (rigtigt
 * citat for indvendinger) og de stærkeste svar fra sælgernes samtaler. Uden situation vælges én tilfældigt.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { situation?: string } | null;
  const situation = b?.situation && isSituation(b.situation) ? b.situation : ALL_SITUATIONS[Math.floor(Math.random() * ALL_SITUATIONS.length)]!;
  const [customerLine, bank] = await Promise.all([customerLineFor(situation), objectionBank()]);
  return NextResponse.json({ situation, label: situationLabel(situation), customerLine, strong: bank[situation as ObjectionCategory] ?? [] });
}

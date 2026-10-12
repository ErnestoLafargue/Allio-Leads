import { NextResponse } from "next/server";
import { nextPracticeObjection } from "@/lib/live-coach/practice";
import { getViewer } from "@/lib/scripts-traening/queries";

/** POST /api/practice/next — en rigtig kundeindvending at øve på (oftest i sælgerens svage kategorier). */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const next = await nextPracticeObjection(viewer.userId);
  if (!next) return NextResponse.json({ error: "Ingen indvendinger at øve på endnu" }, { status: 404 });
  return NextResponse.json(next);
}

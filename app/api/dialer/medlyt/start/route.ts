import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { startMedlyt } from "@/lib/medlyt";

/** Admin: start stille medlyt (Telnyx supervise monitor) på en sælgers aktive lead-leg. */
export async function POST(req: Request) {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const targetUserId =
    typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId mangler." }, { status: 400 });
  }

  const result = await startMedlyt({
    supervisorUserId: session!.user.id,
    targetUserId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const runtime = "nodejs";
export const maxDuration = 30;

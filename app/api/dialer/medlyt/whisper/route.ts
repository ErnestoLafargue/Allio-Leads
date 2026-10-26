import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { setMedlytWhisper } from "@/lib/medlyt";

/** Admin: skift Medlyt mellem stille monitor og whisper (kun sælger hører). */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const supervisorCallControlId =
    typeof body?.supervisorCallControlId === "string"
      ? body.supervisorCallControlId.trim()
      : "";
  const enabled = body?.enabled === true;

  if (!supervisorCallControlId) {
    return NextResponse.json({ error: "supervisorCallControlId mangler." }, { status: 400 });
  }
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) mangler." }, { status: 400 });
  }

  const result = await setMedlytWhisper({ supervisorCallControlId, enabled });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, role: result.role, enabled });
}

export const runtime = "nodejs";

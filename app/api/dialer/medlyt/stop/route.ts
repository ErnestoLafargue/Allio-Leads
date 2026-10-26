import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { stopMedlyt } from "@/lib/medlyt";

/** Admin: hangup kun supervisor-benet (sælger/kunde fortsætter). */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const supervisorCallControlId =
    typeof body?.supervisorCallControlId === "string"
      ? body.supervisorCallControlId.trim()
      : typeof body?.callControlId === "string"
        ? body.callControlId.trim()
        : "";
  if (!supervisorCallControlId) {
    return NextResponse.json({ error: "supervisorCallControlId mangler." }, { status: 400 });
  }

  const result = await stopMedlyt({ supervisorCallControlId });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}

export const runtime = "nodejs";

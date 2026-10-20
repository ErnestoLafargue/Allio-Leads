import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { listMedlytAgents } from "@/lib/medlyt";

/** Admin: live dialer-sælgere til Medlyt-listen. */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const agents = await listMedlytAgents();
  return NextResponse.json({ ok: true, agents });
}

export const runtime = "nodejs";

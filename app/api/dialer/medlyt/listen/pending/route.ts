import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { listPendingMedlytListenForSeller } from "@/lib/medlyt-listen";

/** Sælger: hent aktive Medlyt-sessioner rettet mod mig. */
export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  const sessions = await listPendingMedlytListenForSeller(session!.user.id);
  return NextResponse.json({
    ok: true,
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      offerSdp: s.offerSdp,
      adminIceJson: s.adminIceJson,
    })),
  });
}

export const runtime = "nodejs";

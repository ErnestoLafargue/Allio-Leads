import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { listMedlytAgents } from "@/lib/medlyt";

/** Admin: live dialer-sælgere til Medlyt-listen. */
export async function GET(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const agents = await listMedlytAgents();
  // #region agent log
  const ui = req.headers.get("x-medlyt-ui");
  fetch("http://localhost:7723/ingest/7a50d2a1-e6f0-436c-8453-6828c3db5e26", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c1392e" },
    body: JSON.stringify({
      sessionId: "c1392e",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "app/api/dialer/medlyt/agents/route.ts",
      message: "agents list",
      data: {
        ui,
        rows: agents.map((a) => ({
          status: a.status,
          tone: a.buttonTone,
          canStart: a.canStart,
        })),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  console.warn("[medlyt-debug] H2 agents", {
    ui,
    rows: agents.map((a) => ({
      status: a.status,
      tone: a.buttonTone,
      canStart: a.canStart,
    })),
  });
  // #endregion
  return NextResponse.json({ ok: true, agents });
}

export const runtime = "nodejs";

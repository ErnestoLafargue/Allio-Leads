import { NextResponse } from "next/server";
import { authorizePodioCron } from "@/lib/podio/cron-auth";
import { applyMoederItemUpdate } from "@/lib/podio/moeder-item-update";

/**
 * Genafspil Podio item.update-behandling (production credentials).
 * GET /api/cron/replay-podio-webhook?itemId=3333143395
 */
export async function GET(req: Request) {
  if (!authorizePodioCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemId = Number(new URL(req.url).searchParams.get("itemId") ?? "");
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  try {
    const result = await applyMoederItemUpdate(itemId);
    return NextResponse.json({ itemId, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

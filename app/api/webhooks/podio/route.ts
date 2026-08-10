import { NextResponse } from "next/server";
import {
  isPodioAppConfigured,
  validateHook,
} from "@/lib/podio/client";
import { applyMoederItemUpdate } from "@/lib/podio/moeder-item-update";

/**
 * Indgående Podio-webhook (Podio → Allio) for Møder-appen i Salg-workspace.
 *
 * Status ændres i Podio → opdater mødeudfald i Allio:
 *   - Afventer afholdelse → Afventende
 *   - Møde aflyst - Genbook → Genbooking-kampagne
 *   - Møde Tabt → Tabt
 *   - Under Behandling → Under behandling
 *   - Møde vundet → Salg
 */

function expectedToken(): string {
  return (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
}

function tokenOk(req: Request): boolean {
  const expected = expectedToken();
  if (!expected) return true;
  const got = (new URL(req.url).searchParams.get("token") ?? "").trim();
  return got === expected;
}

export async function POST(req: Request) {
  let params: URLSearchParams;
  try {
    const raw = await req.text();
    params = new URLSearchParams(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const type = (params.get("type") ?? "").trim();
  const hookId = (params.get("hook_id") ?? "").trim();

  if (type !== "hook.verify" && !tokenOk(req)) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  if (type === "hook.verify") {
    const code = (params.get("code") ?? "").trim();
    if (hookId && code && isPodioAppConfigured("moeder")) {
      try {
        await validateHook("moeder", hookId, code);
      } catch {
        console.error("[podio] hook.verify validering fejlede");
        return NextResponse.json({ ok: false, error: "verify failed" }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, handled: "hook.verify" });
  }

  if (type === "item.create" || type === "item.update") {
    const itemId = Number((params.get("item_id") ?? "").trim());
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return NextResponse.json({ ok: true, ignored: "no item_id" });
    }

    if (!isPodioAppConfigured("moeder")) {
      return NextResponse.json({ ok: true, ignored: "podio not configured" });
    }

    try {
      const result = await applyMoederItemUpdate(itemId);
      return NextResponse.json(result);
    } catch (err) {
      console.error("[podio] webhook-behandling fejlede:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ok: true, error: "processing failed" });
    }
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "podio-webhook" });
}

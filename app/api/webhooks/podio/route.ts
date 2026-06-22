import { NextResponse } from "next/server";
import { validateHook } from "@/lib/podio/client";

/**
 * Indgående Podio-webhook (Podio → Allio).
 *
 * Registrering (se docs/PODIO-SETUP.md): opret en hook på Kunder-appen via
 * Podios API med type "item.update" og URL:
 *   https://<domæne>/api/webhooks/podio?token=<PODIO_WEBHOOK_SECRET>
 *
 * Podio sender application/x-www-form-urlencoded med felter:
 *   - type:    "hook.verify" | "item.update" | "item.create" | "item.delete" | ...
 *   - hook_id: hookens id
 *   - code:    (kun ved hook.verify) udfordringskode der skal valideres
 *   - item_id: (ved item.*) item'ets id
 *
 * Podio signerer ikke payloaden. Vi beskytter endpointet med en delt hemmelig
 * token i query-strengen (?token=…) sammenlignet med PODIO_WEBHOOK_SECRET.
 *
 * Denne hook er bevidst tynd og udvidbar. Fremtidige triggers (ikke aktive nu):
 *   - stadie "Gecko åbnet"/"Onboarding afholdt" → handlinger i Allio
 *   - kickoff-dato sat i Podio → opret Cal.eu-booking
 *   - PDF/SMS-udsendelse via Telnyx
 */

function expectedToken(): string {
  return (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
}

function tokenOk(req: Request): boolean {
  const expected = expectedToken();
  // Hvis ingen secret er sat, tillad (lettere opsætning). Sæt PODIO_WEBHOOK_SECRET for at låse.
  if (!expected) return true;
  const got = (new URL(req.url).searchParams.get("token") ?? "").trim();
  return got === expected;
}

export async function POST(req: Request) {
  if (!tokenOk(req)) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  let params: URLSearchParams;
  try {
    const raw = await req.text();
    params = new URLSearchParams(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const type = (params.get("type") ?? "").trim();
  const hookId = (params.get("hook_id") ?? "").trim();

  // Aktiverings-håndtryk: validér hooken så Podio markerer den som aktiv.
  if (type === "hook.verify") {
    const code = (params.get("code") ?? "").trim();
    if (hookId && code) {
      try {
        await validateHook("kunder", hookId, code);
      } catch (err) {
        console.error("[podio] hook.verify validering fejlede:", err instanceof Error ? err.message : err);
        return NextResponse.json({ ok: false, error: "verify failed" }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, handled: "hook.verify" });
  }

  // Item-hændelser: tynd kvittering nu — udvides senere (se header).
  if (type === "item.create" || type === "item.update" || type === "item.delete") {
    const itemId = (params.get("item_id") ?? "").trim();
    console.log(`[podio] webhook ${type} item_id=${itemId || "?"}`);
    return NextResponse.json({ ok: true, handled: type });
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "podio-webhook" });
}

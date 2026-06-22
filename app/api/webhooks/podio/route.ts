import { NextResponse } from "next/server";
import { getItem, readCategoryValue, validateHook } from "@/lib/podio/client";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";

/**
 * Indgående Podio-webhook (Podio → Allio).
 *
 * Registrering (se docs/PODIO-SETUP.md + scripts/podio-register-hooks.mjs): opret
 * en hook på MØDER-appen via Podios API med type "item.update" og URL:
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
 * Aktiv adfærd (Møder-appen):
 *   - Møde-status sat til "Genbook" → flyt leadet til Genbook-kampagnen i Allio
 *     (kun additivt; fjerner aldrig et lead fra Genbook).
 *   - Alle andre statusser ("Aflyst"/"Booket"/"Afholdt") → ingen handling.
 *
 * Leadet udledes af Møde-itemets external_id ("<leadId>-onboarding").
 */

const MOEDE_STATUS_LABEL = "Status";
const MOEDE_GENBOOK = "genbook";
const ONBOARDING_SUFFIX = "-onboarding";

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

/** Udled Allio leadId fra et Møde-items external_id ("<leadId>-onboarding"). */
function leadIdFromMoedeExternalId(externalId: string | null | undefined): string | null {
  const ext = (externalId ?? "").trim();
  if (!ext.endsWith(ONBOARDING_SUFFIX)) return null;
  const leadId = ext.slice(0, -ONBOARDING_SUFFIX.length);
  return leadId || null;
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
        await validateHook("moeder", hookId, code);
      } catch (err) {
        console.error("[podio] hook.verify validering fejlede:", err instanceof Error ? err.message : err);
        return NextResponse.json({ ok: false, error: "verify failed" }, { status: 502 });
      }
    }
    return NextResponse.json({ ok: true, handled: "hook.verify" });
  }

  if (type === "item.create" || type === "item.update") {
    const itemId = Number((params.get("item_id") ?? "").trim());
    if (!Number.isFinite(itemId) || itemId <= 0) {
      console.log(`[podio] webhook ${type} uden gyldigt item_id`);
      return NextResponse.json({ ok: true, ignored: "no item_id" });
    }

    try {
      const item = await getItem("moeder", itemId);
      if (!item) {
        console.log(`[podio] ${type} item ${itemId} → ikke fundet`);
        return NextResponse.json({ ok: true, ignored: "item not found" });
      }

      const leadId = leadIdFromMoedeExternalId(item.external_id);
      const status = readCategoryValue(item, MOEDE_STATUS_LABEL);
      console.log(
        `[podio] ${type} møde item=${itemId} ext=${item.external_id ?? "?"} status=${status ?? "?"} lead=${leadId ?? "?"}`,
      );

      if (!leadId) {
        return NextResponse.json({ ok: true, ignored: "no lead in external_id" });
      }

      // Kun "Genbook" flytter leadet (additivt). Alt andet er en no-op, så Podio
      // aldrig kan fjerne et lead fra Genbook-kampagnen.
      if ((status ?? "").trim().toLowerCase() !== MOEDE_GENBOOK) {
        return NextResponse.json({ ok: true, handled: type, action: "none", status });
      }

      const moved = await moveLeadToRebooking(leadId);
      console.log(
        `[podio] møde ${itemId} status=Genbook → lead ${leadId} ${moved ? "flyttet til Genbook" : "lå allerede i Genbook"}`,
      );
      return NextResponse.json({ ok: true, handled: type, action: moved ? "moved" : "noop" });
    } catch (err) {
      console.error("[podio] webhook-behandling fejlede:", err instanceof Error ? err.message : err);
      // Returnér 200 så Podio ikke spammer med retries på et item vi ikke kan bruge.
      return NextResponse.json({ ok: true, error: "processing failed" });
    }
  }

  if (type === "item.delete") {
    return NextResponse.json({ ok: true, ignored: "item.delete" });
  }

  return NextResponse.json({ ok: true, ignored: type || "unknown" });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "podio-webhook" });
}

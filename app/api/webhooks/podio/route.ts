import { NextResponse } from "next/server";
import {
  getItem,
  isPodioAppConfigured,
  readCategoryValue,
  readPodioDateValue,
  validateHook,
  type PodioAppKey,
  type PodioItem,
} from "@/lib/podio/client";
import { moveLeadToRebooking } from "@/lib/calcom/webhook-apply";
import {
  advanceKundeStadie,
  ensureOpfoelgningsProces,
  KUNDE_STADIE,
  MOEDE,
  MOEDE_TYPE,
  resolveLeadIdFromMoedeItem,
  syncProcessesForStadie,
} from "@/lib/podio/customer-mapping";
import { handleOnboardingAfholdt } from "@/lib/podio/kickoff-from-onboarding";

/**
 * Indgående Podio-webhook (Podio → Allio).
 *
 * Møder-app:
 *   - Onboarding Genbook → Allio Genbook-kampagne
 *   - Onboarding Afholdt + Kick-off dato → kick-off-møde + Cal.eu + stadie
 *   - Kick-off Afholdt → Kampagne kørt
 *   - Kick-off Aflyst/Genbook → opfølgningsproces med noter
 *
 * Kunder-app:
 *   - Stadie-ændring → syncProcessesForStadie
 */

const MOEDE_STATUS_LABEL = "Status";
const MOEDE_TYPE_LABEL = "Type";
const KUNDE_STADIE_LABEL = "Stadie";

const HOOK_APPS: PodioAppKey[] = ["moeder", "kunder"];

function expectedToken(): string {
  return (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
}

function tokenOk(req: Request): boolean {
  const expected = expectedToken();
  if (!expected) return true;
  const got = (new URL(req.url).searchParams.get("token") ?? "").trim();
  return got === expected;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function formatDanishDateTime(d: Date): string {
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: "Europe/Copenhagen",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

async function validateHookOnAnyApp(hookId: string, code: string): Promise<boolean> {
  for (const app of HOOK_APPS) {
    if (!isPodioAppConfigured(app)) continue;
    try {
      await validateHook(app, hookId, code);
      return true;
    } catch {
      /* prøv næste app */
    }
  }
  return false;
}

async function fetchItemFromAnyApp(itemId: number): Promise<{ app: PodioAppKey; item: PodioItem } | null> {
  for (const app of HOOK_APPS) {
    if (!isPodioAppConfigured(app)) continue;
    const item = await getItem(app, itemId);
    if (item) return { app, item };
  }
  return null;
}

async function handleKickoffAflystOrGenbook(
  item: PodioItem,
  leadId: string,
  kind: "aflyst" | "genbook",
): Promise<NextResponse> {
  const scheduled = readPodioDateValue(item, MOEDE.dato);
  const when = scheduled ? formatDanishDateTime(scheduled) : "ukendt tidspunkt";

  let kundeNavn = leadId;
  if (isPodioAppConfigured("kunder")) {
    const rel = item.fields.find((f) => f.label === MOEDE.kunde);
    const kundeId = (rel?.values?.[0]?.value as { item_id?: number } | undefined)?.item_id;
    if (kundeId) {
      const kunde = await getItem("kunder", kundeId);
      const virksomhed = kunde?.fields.find((f) => f.label === "Virksomhed")?.values?.[0]?.value;
      if (typeof virksomhed === "string" && virksomhed.trim()) {
        kundeNavn = virksomhed.trim();
      }
    }
  }

  const noter =
    kind === "aflyst"
      ? `Kick-off-møde aflyst for ${kundeNavn}.\nPlanlagt tid: ${when}.\nFyld op — kontakt kunden og book nyt kick-off.`
      : `Kick-off skal genbookes for ${kundeNavn}.\nOprindelig tid: ${when}.\nNotér ny dato og opdater Kick-off dato på onboarding-mødet ved rebooking.`;

  await ensureOpfoelgningsProces(leadId, noter);
  return NextResponse.json({ ok: true, handled: "item.update", action: `kickoff_${kind}` });
}

async function handleMoederItem(item: PodioItem, type: string): Promise<NextResponse> {
  const leadId = await resolveLeadIdFromMoedeItem(item);
  const status = readCategoryValue(item, MOEDE_STATUS_LABEL);
  const moedeType = readCategoryValue(item, MOEDE_TYPE_LABEL);
  console.log(
    `[podio] ${type} møde item=${item.item_id} ext=${item.external_id ?? "?"} status=${status ?? "?"} type=${moedeType ?? "?"} lead=${leadId ?? "?"}`,
  );

  if (!leadId) {
    return NextResponse.json({ ok: true, ignored: "no lead" });
  }

  const statusNorm = norm(status);
  const typeNorm = norm(moedeType);
  const isOnboarding = typeNorm === norm(MOEDE_TYPE.onboarding);
  const isKickoff = typeNorm === norm(MOEDE_TYPE.kickOff);

  if (statusNorm === "genbook") {
    if (isOnboarding) {
      const moved = await moveLeadToRebooking(leadId);
      console.log(
        `[podio] onboarding møde ${item.item_id} Genbook → lead ${leadId} ${moved ? "flyttet" : "noop"}`,
      );
      return NextResponse.json({ ok: true, handled: type, action: moved ? "moved" : "noop" });
    }
    if (isKickoff) {
      return handleKickoffAflystOrGenbook(item, leadId, "genbook");
    }
    return NextResponse.json({ ok: true, handled: type, action: "none" });
  }

  if (statusNorm === "aflyst") {
    if (isKickoff) {
      return handleKickoffAflystOrGenbook(item, leadId, "aflyst");
    }
    return NextResponse.json({ ok: true, handled: type, action: "none" });
  }

  if (statusNorm === "afholdt") {
    if (isOnboarding) {
      const result = await handleOnboardingAfholdt(item);
      if (!result.ok) {
        return NextResponse.json({
          ok: true,
          handled: type,
          action: "onboarding_afholdt_skipped",
          reason: result.reason,
        });
      }
      return NextResponse.json({ ok: true, handled: type, action: result.action });
    }
    if (isKickoff) {
      await advanceKundeStadie(leadId, KUNDE_STADIE.kampagneKoert);
      return NextResponse.json({ ok: true, handled: type, action: "stadie_kampagne_koert" });
    }
  }

  return NextResponse.json({ ok: true, handled: type, action: "none", status });
}

async function handleKunderItem(item: PodioItem, type: string): Promise<NextResponse> {
  const leadId = (item.external_id ?? "").trim();
  const stadie = readCategoryValue(item, KUNDE_STADIE_LABEL);
  console.log(
    `[podio] ${type} kunde item=${item.item_id} ext=${leadId || "?"} stadie=${stadie ?? "?"}`,
  );

  if (!leadId) {
    return NextResponse.json({ ok: true, ignored: "no lead in external_id" });
  }
  if (!stadie) {
    return NextResponse.json({ ok: true, ignored: "no stadie" });
  }

  await syncProcessesForStadie(leadId, stadie);
  return NextResponse.json({ ok: true, handled: type, action: "sync_processes", stadie });
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

  if (type === "hook.verify") {
    const code = (params.get("code") ?? "").trim();
    if (hookId && code) {
      const ok = await validateHookOnAnyApp(hookId, code);
      if (!ok) {
        console.error("[podio] hook.verify validering fejlede for alle apps");
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
      const found = await fetchItemFromAnyApp(itemId);
      if (!found) {
        console.log(`[podio] ${type} item ${itemId} → ikke fundet`);
        return NextResponse.json({ ok: true, ignored: "item not found" });
      }

      if (found.app === "moeder") {
        return await handleMoederItem(found.item, type);
      }
      return await handleKunderItem(found.item, type);
    } catch (err) {
      console.error("[podio] webhook-behandling fejlede:", err instanceof Error ? err.message : err);
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

import { NextResponse } from "next/server";
import { isPodioAppConfigured } from "@/lib/podio/client";

const HOOK_PATH = "/api/webhooks/podio";
const BASE_URL = "https://allio-leads.vercel.app";

function authorize(req: Request): boolean {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  const podioSecret = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
  const authSecret = (process.env.AUTH_SECRET ?? "").trim();
  return Boolean(
    (podioSecret && token === podioSecret) ||
      (authSecret && authHeader === `Bearer ${authSecret}`),
  );
}

async function podioToken(appId: string, appToken: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: appId,
    app_token: appToken,
    client_id: (process.env.PODIO_CLIENT_ID ?? "").trim(),
    client_secret: (process.env.PODIO_CLIENT_SECRET ?? "").trim(),
  });
  const res = await fetch("https://podio.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Podio token fejl: ${json.error ?? res.status}`);
  }
  return json.access_token;
}

/**
 * Registrér item.update webhook på Møder-appen (production credentials).
 * GET /api/cron/register-podio-hooks?replace=1
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appId = (process.env.PODIO_MOEDER_APP_ID ?? "").trim();
  const appToken = (process.env.PODIO_MOEDER_APP_TOKEN ?? "").trim();
  const webhookSecret = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();

  if (!isPodioAppConfigured("moeder")) {
    return NextResponse.json({ error: "Podio Møder-app ikke konfigureret" }, { status: 500 });
  }

  const url = new URL(req.url);
  const replace = url.searchParams.get("replace") === "1";
  const hookUrl = webhookSecret
    ? `${BASE_URL}${HOOK_PATH}?token=${encodeURIComponent(webhookSecret)}`
    : `${BASE_URL}${HOOK_PATH}`;

  try {
    const token = await podioToken(appId, appToken);
    const listRes = await fetch(`https://api.podio.com/hook/app/${appId}/`, {
      headers: { Authorization: `OAuth2 ${token}` },
    });
    const existing = (await listRes.json()) as { hook_id?: number; type?: string; url?: string }[];

    if (replace && Array.isArray(existing)) {
      for (const h of existing) {
        if (h.url?.includes(HOOK_PATH) && h.type === "item.update" && h.hook_id) {
          await fetch(`https://api.podio.com/hook/${h.hook_id}`, {
            method: "DELETE",
            headers: { Authorization: `OAuth2 ${token}` },
          });
        }
      }
    }

    const dupe = Array.isArray(existing)
      ? existing.find((h) => h.url?.includes(HOOK_PATH) && h.type === "item.update")
      : null;

    if (dupe?.hook_id) {
      return NextResponse.json({
        ok: true,
        action: "exists",
        hookId: dupe.hook_id,
        hookUrl: hookUrl.replace(/token=[^&]+/, "token=***"),
      });
    }

    const createRes = await fetch(`https://api.podio.com/hook/app/${appId}/`, {
      method: "POST",
      headers: {
        Authorization: `OAuth2 ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: hookUrl, type: "item.update" }),
    });
    const created = (await createRes.json()) as { hook_id?: number; error?: string };
    if (!createRes.ok) {
      return NextResponse.json(
        { error: created.error ?? `HTTP ${createRes.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      action: "created",
      hookId: created.hook_id,
      hookUrl: hookUrl.replace(/token=[^&]+/, "token=***"),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}

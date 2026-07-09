import { NextResponse } from "next/server";

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

/**
 * Genafspil Podio item.update webhook internt (production credentials).
 * GET /api/cron/replay-podio-webhook?itemId=3333143395
 */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemId = Number(new URL(req.url).searchParams.get("itemId") ?? "");
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "itemId required" }, { status: 400 });
  }

  const webhookSecret = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "PODIO_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const webhookUrl = `${BASE_URL}/api/webhooks/podio?token=${encodeURIComponent(webhookSecret)}`;
  const body = new URLSearchParams({
    type: "item.update",
    item_id: String(itemId),
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    itemId,
    response: json,
  });
}

/**
 * Registrér Podio → Allio webhook på MØDER-appen (item.update + item.create).
 *
 * Når en sælger manuelt sætter Møde-status til "Genbook" i Podio, fyrer Podio en
 * item.update-hook mod Allio (/api/webhooks/podio), som flytter leadet til
 * Genbook-kampagnen. Se app/api/webhooks/podio/route.ts.
 *
 * Brug:
 *   node scripts/podio-register-hooks.mjs --list
 *   node scripts/podio-register-hooks.mjs --url=https://allio-leads.vercel.app
 *   node scripts/podio-register-hooks.mjs --url=https://allio-leads.vercel.app --replace
 *
 * --url   Allios offentlige base-URL (uden trailing slash). Default: prod.
 * --list  Vis kun eksisterende hooks (ingen ændring).
 * --replace  Slet eksisterende item.update/item.create-hooks mod vores sti før oprettelse.
 *
 * Podio sender straks et hook.verify-kald; Allios endpoint validerer det automatisk
 * (kræver at den angivne base-URL er live og deployet).
 *
 * Kræver i .env.local: PODIO_CLIENT_ID/SECRET, PODIO_MOEDER_APP_ID/TOKEN,
 * og (anbefalet) PODIO_WEBHOOK_SECRET.
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.podio.com";
const OAUTH = "https://podio.com/oauth/token";
const DEFAULT_BASE_URL = "https://allio-leads.vercel.app";
const HOOK_PATH = "/api/webhooks/podio";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim().replace(/\s+#.*$/, "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}
loadEnvLocal();

const CLIENT_ID = (process.env.PODIO_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.PODIO_CLIENT_SECRET ?? "").trim();
const MOEDER_APP_ID = (process.env.PODIO_MOEDER_APP_ID ?? "").trim();
const MOEDER_APP_TOKEN = (process.env.PODIO_MOEDER_APP_TOKEN ?? "").trim();
const WEBHOOK_SECRET = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const FLAG_LIST = process.argv.includes("--list");
const FLAG_REPLACE = process.argv.includes("--replace");
const BASE_URL = (arg("url") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

function hookUrl() {
  const u = `${BASE_URL}${HOOK_PATH}`;
  return WEBHOOK_SECRET ? `${u}?token=${encodeURIComponent(WEBHOOK_SECRET)}` : u;
}

let token = null;
async function appAuth() {
  if (token) return token;
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: MOEDER_APP_ID,
    app_token: MOEDER_APP_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token fejl: ${JSON.stringify(json).slice(0, 200)}`);
  token = json.access_token;
  return token;
}

async function api(method, pathname, body) {
  const t = await appAuth();
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `OAuth2 ${t}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function listHooks() {
  const { status, json } = await api("GET", `/hook/app/${MOEDER_APP_ID}/`);
  if (status !== 200) throw new Error(`Kunne ikke hente hooks (HTTP ${status})`);
  return Array.isArray(json) ? json : [];
}

function samePath(url) {
  return typeof url === "string" && url.includes(HOOK_PATH);
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !MOEDER_APP_ID || !MOEDER_APP_TOKEN) {
    console.error("Mangler PODIO_CLIENT_ID/SECRET eller PODIO_MOEDER_APP_ID/TOKEN i .env.local");
    process.exit(1);
  }

  const existing = await listHooks();
  console.log(`Eksisterende hooks på Møder-appen (${MOEDER_APP_ID}): ${existing.length}`);
  for (const h of existing) {
    console.log(`  - id=${h.hook_id} type=${h.type} status=${h.status} url=${h.url}`);
  }

  if (FLAG_LIST) {
    console.log("\n(--list: ingen ændringer foretaget)");
    return;
  }

  if (!WEBHOOK_SECRET) {
    console.log("\n⚠ PODIO_WEBHOOK_SECRET er ikke sat — hooken oprettes uden token (mindre sikkert).");
  }

  if (FLAG_REPLACE) {
    for (const h of existing) {
      if (samePath(h.url) && (h.type === "item.update" || h.type === "item.create")) {
        const del = await api("DELETE", `/hook/${h.hook_id}`);
        console.log(`  ${del.status === 200 || del.status === 204 ? "✓ slettede" : "✖ kunne ikke slette"} hook id=${h.hook_id}`);
      }
    }
  } else {
    const dupe = existing.find((h) => samePath(h.url) && h.type === "item.update");
    if (dupe) {
      console.log(`\n✓ En item.update-hook mod vores sti findes allerede (id=${dupe.hook_id}, status=${dupe.status}).`);
      console.log("  Brug --replace for at gendanne den (fx hvis status ikke er 'active').");
      return;
    }
  }

  const url = hookUrl();
  console.log(`\nOpretter item.update-hook → ${url.replace(/token=[^&]+/, "token=***")}`);
  const created = await api("POST", `/hook/app/${MOEDER_APP_ID}/`, { url, type: "item.update" });
  if (created.status === 200 || created.status === 201) {
    console.log(`✓ Hook oprettet (id=${created.json?.hook_id}). Podio sender nu et hook.verify-kald.`);
    console.log("  Allios /api/webhooks/podio validerer automatisk — tjek at base-URL er live/deployet.");
  } else {
    console.log(`✖ Kunne ikke oprette hook (HTTP ${created.status}): ${created.text.slice(0, 300)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

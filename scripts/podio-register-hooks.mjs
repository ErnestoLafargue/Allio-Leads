/**
 * Registrér Podio → Allio webhooks på MØDER-, KUNDER- og PROCESSER-appen.
 *
 * Brug:
 *   node scripts/podio-register-hooks.mjs --list
 *   node scripts/podio-register-hooks.mjs --url=https://allio-leads.vercel.app
 *   node scripts/podio-register-hooks.mjs --url=https://allio-leads.vercel.app --replace
 *
 * --url      Allios offentlige base-URL (uden trailing slash). Default: prod.
 * --list     Vis kun eksisterende hooks (ingen ændring).
 * --replace  Slet eksisterende hooks mod vores sti før oprettelse.
 *
 * Kræver i .env.local: PODIO_CLIENT_ID/SECRET, PODIO_MOEDER_*, PODIO_KUNDER_*,
 * PODIO_PROCESSER_* og (anbefalet) PODIO_WEBHOOK_SECRET.
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
const WEBHOOK_SECRET = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();

const APPS = [
  {
    name: "Møder",
    appId: (process.env.PODIO_MOEDER_APP_ID ?? "").trim(),
    appToken: (process.env.PODIO_MOEDER_APP_TOKEN ?? "").trim(),
    hookTypes: ["item.update"],
  },
  {
    name: "Kunder",
    appId: (process.env.PODIO_KUNDER_APP_ID ?? "").trim(),
    appToken: (process.env.PODIO_KUNDER_APP_TOKEN ?? "").trim(),
    hookTypes: ["item.update", "item.delete"],
  },
  {
    name: "Processer",
    appId: (process.env.PODIO_PROCESSER_APP_ID ?? "").trim(),
    appToken: (process.env.PODIO_PROCESSER_APP_TOKEN ?? "").trim(),
    hookTypes: ["item.update"],
  },
].filter((a) => a.appId && a.appToken);

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

const tokenByAppId = new Map();

async function appAuth(appId, appToken) {
  const cached = tokenByAppId.get(appId);
  if (cached) return cached;
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: appId,
    app_token: appToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token fejl for app ${appId}: ${JSON.stringify(json).slice(0, 200)}`);
  tokenByAppId.set(appId, json.access_token);
  return json.access_token;
}

async function api(appId, appToken, method, pathname, body) {
  const t = await appAuth(appId, appToken);
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

async function listHooks(app) {
  const { status, json } = await api(app.appId, app.appToken, "GET", `/hook/app/${app.appId}/`);
  if (status !== 200) throw new Error(`Kunne ikke hente hooks for ${app.name} (HTTP ${status})`);
  return Array.isArray(json) ? json : [];
}

function samePath(url) {
  return typeof url === "string" && url.includes(HOOK_PATH);
}

async function ensureHooksForApp(app) {
  const existing = await listHooks(app);
  console.log(`\n${app.name}-appen (${app.appId}): ${existing.length} hook(s)`);
  for (const h of existing) {
    console.log(`  - id=${h.hook_id} type=${h.type} status=${h.status} url=${h.url}`);
  }

  if (FLAG_LIST) return;

  const url = hookUrl();
  const maskedUrl = url.replace(/token=[^&]+/, "token=***");

  if (FLAG_REPLACE) {
    for (const h of existing) {
      if (samePath(h.url) && app.hookTypes.includes(h.type)) {
        const del = await api(app.appId, app.appToken, "DELETE", `/hook/${h.hook_id}`);
        console.log(
          `  ${del.status === 200 || del.status === 204 ? "✓ slettede" : "✖ kunne ikke slette"} hook id=${h.hook_id} type=${h.type}`,
        );
      }
    }
  }

  for (const hookType of app.hookTypes) {
    if (!FLAG_REPLACE) {
      const dupe = existing.find((h) => samePath(h.url) && h.type === hookType);
      if (dupe) {
        console.log(`  ✓ ${hookType} findes allerede (id=${dupe.hook_id}, status=${dupe.status})`);
        continue;
      }
    }

    console.log(`  Opretter ${hookType} → ${maskedUrl}`);
    const created = await api(app.appId, app.appToken, "POST", `/hook/app/${app.appId}/`, {
      url,
      type: hookType,
    });
    if (created.status === 200 || created.status === 201) {
      console.log(`  ✓ Hook oprettet type=${hookType} (id=${created.json?.hook_id})`);
    } else {
      console.log(`  ✖ Kunne ikke oprette ${hookType} (HTTP ${created.status}): ${created.text.slice(0, 300)}`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Mangler PODIO_CLIENT_ID/SECRET i .env.local");
    process.exit(1);
  }
  if (APPS.length === 0) {
    console.error("Mangler PODIO_MOEDER_*, PODIO_KUNDER_* og/eller PODIO_PROCESSER_* app-id/token i .env.local");
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.log("⚠ PODIO_WEBHOOK_SECRET er ikke sat — hooken oprettes uden token (mindre sikkert).");
  }

  for (const app of APPS) {
    await ensureHooksForApp(app);
  }

  if (FLAG_LIST) {
    console.log("\n(--list: ingen ændringer foretaget)");
  } else {
    console.log("\nPodio sender hook.verify — Allios endpoint validerer automatisk når base-URL er live.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

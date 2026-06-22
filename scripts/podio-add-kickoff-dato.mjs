/**
 * Tilføj manglende "Kick-off dato" felt på Møder-appen (idempotent).
 *
 *   node scripts/podio-add-kickoff-dato.mjs
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.podio.com";
const OAUTH = "https://podio.com/oauth/token";
const FIELD_LABEL = "Kick-off dato";

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

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !MOEDER_APP_ID || !MOEDER_APP_TOKEN) {
    console.error("Mangler PODIO_* credentials i .env.local");
    process.exit(1);
  }

  const app = await api("GET", `/app/${MOEDER_APP_ID}`);
  if (app.status !== 200) {
    console.error(`Kunne ikke hente Møder-app (${app.status})`);
    process.exit(1);
  }

  const fields = app.json?.fields ?? [];
  const exists = fields.some((f) => (f?.label ?? "").trim() === FIELD_LABEL);
  if (exists) {
    console.log(`✓ Felt "${FIELD_LABEL}" findes allerede på Møder-appen.`);
    return;
  }

  const created = await api("POST", `/app/${MOEDER_APP_ID}/field/`, {
    type: "date",
    config: {
      label: FIELD_LABEL,
      settings: { calendar: true, end: "disabled", time: "enabled" },
    },
  });

  if (created.status === 200 || created.status === 201) {
    console.log(`✓ Felt "${FIELD_LABEL}" oprettet på Møder-appen.`);
  } else {
    console.error(`✖ Kunne ikke oprette felt (${created.status}): ${created.text.slice(0, 300)}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

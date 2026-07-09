/**
 * Find Salg-workspace + Møder-app og verificér feltlabels.
 *
 * Brug:
 *   node scripts/podio-find-moeder-app.mjs
 *   node scripts/podio-find-moeder-app.mjs --workspace=Salg
 *   node scripts/podio-find-moeder-app.mjs --app=Møder
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.podio.com";
const OAUTH = "https://podio.com/oauth/token";

const EXPECTED_LABELS = [
  "Virksomhed",
  "Fornavn",
  "Efternavn",
  "Sælger",
  "Boket af",
  "Status",
  "Telefon",
  "Email",
  "Dato for møde",
  "Møde link",
  "Produkter",
  "Lead-Id",
  "Item-id",
];

const EXPECTED_STATUS = [
  "Afventer afholdelse",
  "Møde aflyst - Genbook",
  "Møde Tabt",
  "Møde vundet",
];

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

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const CLIENT_ID = (process.env.PODIO_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.PODIO_CLIENT_SECRET ?? "").trim();
const MOEDER_APP_ID = (process.env.PODIO_MOEDER_APP_ID ?? "").trim();
const MOEDER_APP_TOKEN = (process.env.PODIO_MOEDER_APP_TOKEN ?? "").trim();
const WORKSPACE_FILTER = (arg("workspace") ?? "Salg").trim().toLowerCase();
const APP_FILTER = (arg("app") ?? "Møder").trim().toLowerCase();

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

async function appAuth(appId, appToken) {
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
  if (!res.ok) throw new Error(`Token fejl: ${JSON.stringify(json).slice(0, 200)}`);
  return json.access_token;
}

async function api(token, method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `OAuth2 ${token}`, "Content-Type": "application/json" },
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

async function verifyConfiguredApp() {
  if (!MOEDER_APP_ID || !MOEDER_APP_TOKEN) {
    console.error("Mangler PODIO_MOEDER_APP_ID/TOKEN i .env.local");
    process.exit(1);
  }
  const token = await appAuth(MOEDER_APP_ID, MOEDER_APP_TOKEN);
  const { status, json } = await api(token, "GET", `/app/${MOEDER_APP_ID}`);
  if (status !== 200) {
    console.error(`Kunne ikke hente app ${MOEDER_APP_ID} (HTTP ${status})`);
    process.exit(1);
  }

  console.log(`\nKonfigureret Møder-app: ${json.name ?? "?"} (id=${MOEDER_APP_ID})`);
  console.log(`Workspace: ${json.space?.name ?? "?"} (space_id=${json.space?.space_id ?? "?"})`);

  const fields = json.fields ?? [];
  const labels = new Map(fields.map((f) => [norm(f.label), f]));

  console.log("\nFelter:");
  for (const label of EXPECTED_LABELS) {
    const f = labels.get(norm(label));
    if (f) {
      console.log(`  ✓ ${label} (${f.type}, external_id=${f.external_id})`);
    } else {
      console.log(`  ✖ ${label} — MANGLER`);
    }
  }

  const statusField = labels.get(norm("Status"));
  if (statusField?.config?.settings?.options) {
    console.log("\nStatus-valg:");
    for (const opt of statusField.config.settings.options) {
      const text = opt.text ?? opt.status ?? "?";
      const ok = EXPECTED_STATUS.some((s) => norm(s) === norm(text));
      console.log(`  ${ok ? "✓" : "?"} ${text}`);
    }
  }

  const produkterField = labels.get(norm("Produkter"));
  if (produkterField?.config?.settings?.options) {
    console.log("\nProdukter-valg:");
    for (const opt of produkterField.config.settings.options) {
      console.log(`  - ${opt.text ?? opt.status ?? "?"}`);
    }
  }

  console.log("\nEnv (sæt i Vercel hvis ikke allerede):");
  console.log(`  PODIO_MOEDER_APP_ID=${MOEDER_APP_ID}`);
  console.log(`  PODIO_MOEDER_APP_TOKEN=<app-token>`);
}

async function discoverWorkspaces() {
  console.log("Discovery kræver bruger-login (PODIO_USERNAME/PODIO_PASSWORD) — springer over.");
  console.log("Brug i stedet app-token fra Møder-appens Developer-indstillinger.");
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Mangler PODIO_CLIENT_ID/SECRET i .env.local");
    process.exit(1);
  }

  if (MOEDER_APP_ID && MOEDER_APP_TOKEN) {
    await verifyConfiguredApp();
  } else {
    await discoverWorkspaces();
    console.log(`\nFiltrer: workspace="${WORKSPACE_FILTER}", app="${APP_FILTER}"`);
    console.log("Sæt PODIO_MOEDER_APP_ID og PODIO_MOEDER_APP_TOKEN fra Podio → Møder → ··· → Developer");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

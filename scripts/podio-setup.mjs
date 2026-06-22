/**
 * Podio CRM — automatisk opsætning.
 *
 * Opretter de 5 apps (Leveringsmodeller, Kunder, Møder, Processer/Leverancer,
 * Betalingsaftaler) med præcis de felter/kategorier/relationer som Allio-koden
 * forventer (felter slås op via etiket, så labels skal matche), samt
 * Genaktiverings-item'et med external_id "genaktivering".
 *
 * Idempotent: apps der allerede findes i workspacet (samme navn) genbruges og
 * røres ikke. Kør igen uden problemer.
 *
 * Kør lokalt:
 *   1) Opret en API-nøgle på https://podio.com/settings/api  → client_id + client_secret
 *   2) Sæt i .env.local (eller som miljøvariabler):
 *        PODIO_CLIENT_ID, PODIO_CLIENT_SECRET, PODIO_USERNAME, PODIO_PASSWORD
 *      (PODIO_USERNAME/PASSWORD = dit Podio-login; bruges kun lokalt til at
 *       oprette apps. Gem dem IKKE i Vercel.)
 *   3) Find dit workspace space_id:  node scripts/podio-setup.mjs --spaces
 *      Sæt PODIO_SPACE_ID i .env.local.
 *   4) Opret alt:  node scripts/podio-setup.mjs
 *
 * Til sidst printer scriptet app-id'erne + en env-blok. Tokens hentes manuelt
 * (én pr. app: app → ··· → Developer → Token) og indsættes i .env.local/Vercel.
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.podio.com";
const OAUTH = "https://podio.com/oauth/token";

// --- .env.local indlæsning (simpel, afhængighedsfri) -----------------------

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
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
const USERNAME = (process.env.PODIO_USERNAME ?? "").trim();
const PASSWORD = (process.env.PODIO_PASSWORD ?? "").trim();
const SPACE_ID = (process.env.PODIO_SPACE_ID ?? "").trim();

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  die("Mangler PODIO_CLIENT_ID / PODIO_CLIENT_SECRET (opret API-nøgle på https://podio.com/settings/api).");
}
if (!USERNAME || !PASSWORD) {
  die("Mangler PODIO_USERNAME / PODIO_PASSWORD (dit Podio-login — bruges kun lokalt).");
}

// --- Auth + HTTP -----------------------------------------------------------

let TOKEN = "";

async function auth() {
  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) die(`Login fejlede (${res.status}): ${text.slice(0, 300)}`);
  TOKEN = JSON.parse(text).access_token;
  if (!TOKEN) die("Login-svar uden access_token.");
  console.log("✓ Logget ind på Podio.");
}

async function apiRaw(method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `OAuth2 ${TOKEN}`,
      "Content-Type": "application/json",
    },
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

async function api(method, pathname, body) {
  const { status, json, text } = await apiRaw(method, pathname, body);
  if (status < 200 || status >= 300) {
    throw new Error(`${method} ${pathname} -> ${status}: ${text.slice(0, 400)}`);
  }
  return json;
}

// --- Felt-hjælpere ---------------------------------------------------------

const COLORS = ["DCEBD8", "F7F0C9", "FFD5C2", "D2E5FF", "E0E0E0", "F4A1A1", "FCECD5", "D2D2D2", "C7E0D2", "EFE3F4"];

function catOptions(labels) {
  return labels.map((text, i) => ({ status: "active", text, color: COLORS[i % COLORS.length] }));
}

function text(label, size = "small", required = false) {
  return { type: "text", config: { label, required, settings: { size } } };
}
function phone(label) {
  return { type: "phone", config: { label } };
}
function email(label) {
  return { type: "email", config: { label } };
}
function link(label) {
  return { type: "embed", config: { label } };
}
function location(label) {
  return { type: "location", config: { label } };
}
function numberField(label) {
  return { type: "number", config: { label } };
}
function category(label, labels) {
  return {
    type: "category",
    config: { label, settings: { options: catOptions(labels), multiple: false, display: "list" } },
  };
}
function date(label, time) {
  return {
    type: "date",
    config: { label, settings: { calendar: true, end: "disabled", time: time ? "enabled" : "disabled" } },
  };
}
function money(label) {
  return { type: "money", config: { label, settings: { allowed_currencies: ["DKK"] } } };
}
function appRef(label, appId) {
  return { type: "app", config: { label, settings: { referenced_apps: [{ app_id: appId }], multiple: false } } };
}

// --- App-oprettelse (idempotent) -------------------------------------------

async function listSpaceApps(spaceId) {
  return api("GET", `/app/space/${spaceId}/`);
}

async function ensureApp(spaceId, name, itemName, fields, existing) {
  const found = existing.find((a) => a?.config?.name === name);
  if (found) {
    console.log(`= App findes allerede: "${name}" (app_id=${found.app_id}) — springer over`);
    return found.app_id;
  }
  const created = await api("POST", "/app/", {
    space_id: Number(spaceId),
    config: { type: "standard", name, item_name: itemName, allow_edit: true, allow_attachments: true },
    fields,
  });
  console.log(`+ Oprettede app: "${name}" (app_id=${created.app_id})`);
  return created.app_id;
}

async function ensureGenaktivering(leveringId) {
  const lookup = await apiRaw("GET", `/item/app/${leveringId}/external_id/genaktivering`);
  if (lookup.status === 200) {
    console.log("= Genaktivering-item findes allerede — springer over");
    return;
  }
  const app = await api("GET", `/app/${leveringId}`);
  const byLabel = Object.fromEntries(app.fields.map((f) => [f.config.label, f.external_id]));
  const fields = {};
  if (byLabel["Navn"]) fields[byLabel["Navn"]] = "Genaktivering";
  if (byLabel["Beskrivelse"]) fields[byLabel["Beskrivelse"]] = "Genaktiverings-pakke (standard leveringsmodel).";
  if (byLabel["Stadier"]) {
    fields[byLabel["Stadier"]] =
      "Møde booket → Gecko åbnet → Møde afholdt → Kick-off prep → SMS Levering → " +
      "Kick-off afholdt → Kampagne kørt → Loom Levering → Opsalg & Binding → " +
      "Løbende aftale → Tabt/Annulleret";
  }
  await api("POST", `/item/app/${leveringId}/`, { external_id: "genaktivering", fields });
  console.log("+ Oprettede Genaktivering-item (external_id=genaktivering)");
}

// --- Workspace-discovery ---------------------------------------------------

async function printSpaces() {
  const orgs = await api("GET", "/org/");
  console.log("\nDine workspaces (sæt PODIO_SPACE_ID i .env.local):\n");
  for (const org of orgs) {
    console.log(`  Org: ${org.name}`);
    for (const space of org.spaces ?? []) {
      console.log(`    - ${space.name}  →  PODIO_SPACE_ID="${space.space_id}"`);
    }
  }
  console.log("");
}

// --- Hovedflow -------------------------------------------------------------

async function main() {
  await auth();

  if (process.argv.includes("--spaces")) {
    await printSpaces();
    return;
  }

  if (!SPACE_ID) {
    console.log("\nPODIO_SPACE_ID mangler. Her er dine workspaces:");
    await printSpaces();
    die("Sæt PODIO_SPACE_ID i .env.local og kør igen.");
  }

  const existing = await listSpaceApps(SPACE_ID);

  const STADIER = [
    "Møde booket",
    "Gecko åbnet",
    "Møde afholdt",
    "Kick-off prep",
    "SMS Levering",
    "Kick-off afholdt",
    "Kampagne kørt",
    "Loom Levering",
    "Opsalg & Binding",
    "Løbende aftale",
    "Tabt/Annulleret",
  ];

  // 1) Leveringsmodeller (ingen relationer)
  const leveringId = await ensureApp(
    SPACE_ID,
    "Leveringsmodeller",
    "Leveringsmodel",
    [text("Navn", "small", true), text("Beskrivelse", "large"), money("Standardpris"), text("Stadier", "large")],
    existing,
  );

  // 2) Kunder (relation → Leveringsmodeller)
  const kunderId = await ensureApp(
    SPACE_ID,
    "Kunder",
    "Kunde",
    [
      text("Virksomhed", "small", true),
      text("Kontaktperson"),
      phone("Telefon"),
      email("Email"),
      text("CVR"),
      location("Adresse"),
      text("Kontonummer"),
      text("Registreringsnummer"),
      text("Booket af"),
      link("Første mødelink"),
      text("Allio Lead ID"),
      text("Cal booking uid"),
      category("Stadie", STADIER),
      appRef("Leveringsmodel", leveringId),
    ],
    existing,
  );

  // 3) Møder (relation → Kunder)
  const moederId = await ensureApp(
    SPACE_ID,
    "Møder",
    "Møde",
    [
      appRef("Kunde", kunderId),
      category("Type", ["Onboarding", "Kick-off", "Strategi/Performance", "Årsmøde"]),
      date("Dato & tid", true),
      link("Mødelink"),
      category("Status", ["Booket", "Afholdt", "Aflyst", "Genbook"]),
      text("Fathom-noter", "large"),
      text("Ansvarlig"),
    ],
    existing,
  );

  // 4) Processer/Leverancer (relation → Kunder)
  const processerId = await ensureApp(
    SPACE_ID,
    "Processer/Leverancer",
    "Proces",
    [
      text("Proces", "small", true),
      appRef("Kunde", kunderId),
      text("Ansvarlig"),
      category("Status", ["Ikke startet", "I gang", "Færdig"]),
      text("Noter", "large"),
    ],
    existing,
  );

  // 5) Betalingsaftaler (relation → Kunder)
  const betalingId = await ensureApp(
    SPACE_ID,
    "Betalingsaftaler",
    "Betalingsaftale",
    [
      appRef("Kunde", kunderId),
      category("Model", ["No cure no pay", "Månedlig betaling", "12 mrd. binding"]),
      money("Beløb"),
      money("Rabat"),
      text("Bindingsperiode"),
      category("Betalingskort indsat", ["Ja", "Nej"]),
      category("Kontraktstatus", ["Ikke sendt", "Sendt", "Accepteret"]),
      date("Startdato", false),
    ],
    existing,
  );

  // Genaktiverings-model
  await ensureGenaktivering(leveringId);

  // --- Output ---
  console.log("\n========================================================");
  console.log("FÆRDIG. Indsæt i .env.local + Vercel (tokens hentes manuelt):");
  console.log("  Hvert app-token: åbn appen → ··· → Developer → kopier 'Token'");
  console.log("========================================================\n");
  console.log(`PODIO_CLIENT_ID="${CLIENT_ID}"`);
  console.log(`PODIO_CLIENT_SECRET="${CLIENT_SECRET}"`);
  console.log(`PODIO_KUNDER_APP_ID="${kunderId}"`);
  console.log(`PODIO_KUNDER_APP_TOKEN=""        # ← Kunder → Developer → Token`);
  console.log(`PODIO_MOEDER_APP_ID="${moederId}"`);
  console.log(`PODIO_MOEDER_APP_TOKEN=""        # ← Møder → Developer → Token`);
  console.log(`PODIO_PROCESSER_APP_ID="${processerId}"`);
  console.log(`PODIO_PROCESSER_APP_TOKEN=""     # ← Processer/Leverancer → Developer → Token`);
  console.log(`PODIO_BETALING_APP_ID="${betalingId}"`);
  console.log(`PODIO_BETALING_APP_TOKEN=""      # ← Betalingsaftaler → Developer → Token`);
  console.log(`PODIO_LEVERING_APP_ID="${leveringId}"`);
  console.log(`PODIO_LEVERING_APP_TOKEN=""      # ← Leveringsmodeller → Developer → Token`);
  console.log("");
}

main().catch((err) => {
  console.error("\n✖ Fejl:", err.message ?? err);
  process.exit(1);
});

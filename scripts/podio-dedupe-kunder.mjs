/**
 * Find og rapportér dublet-kunder i Podio (manglende external_id eller samme Allio Lead ID).
 *
 *   set -a && source .env.local && set +a
 *   node scripts/podio-dedupe-kunder.mjs
 *   node scripts/podio-dedupe-kunder.mjs --lead-id=cmxxx
 *   node scripts/podio-dedupe-kunder.mjs --delete-duplicates --lead-id=cmxxx
 *
 * --delete-duplicates  Slet dubletter UDEN external_id når der findes én med external_id=leadId.
 *                      Brug med forsigtighed — tag backup i Podio først.
 */

import fs from "node:fs";
import path from "node:path";

const API = "https://api.podio.com";
const OAUTH = "https://podio.com/oauth/token";

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
const KUNDER_APP_ID = (process.env.PODIO_KUNDER_APP_ID ?? "").trim();
const KUNDER_APP_TOKEN = (process.env.PODIO_KUNDER_APP_TOKEN ?? "").trim();

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const LEAD_FILTER = (arg("lead-id") ?? "").trim();
const DELETE_DUPES = process.argv.includes("--delete-duplicates");

let accessToken = null;

async function auth() {
  if (accessToken) return accessToken;
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: KUNDER_APP_ID,
    app_token: KUNDER_APP_TOKEN,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Podio auth fejlede: ${JSON.stringify(json).slice(0, 200)}`);
  accessToken = json.access_token;
  return accessToken;
}

async function api(method, pathname, body) {
  const t = await auth();
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

function readTextField(item, label) {
  const field = item.fields?.find((f) => (f.label ?? f.config?.label) === label);
  const raw = field?.values?.[0]?.value;
  return typeof raw === "string" ? raw.trim() : "";
}

async function listAllKunder() {
  const items = [];
  let offset = 0;
  const limit = 50;
  for (;;) {
    const { status, json } = await api("POST", `/item/app/${KUNDER_APP_ID}/filter/`, {
      filters: {},
      limit,
      offset,
    });
    if (status !== 200) throw new Error(`Filter fejlede HTTP ${status}`);
    const batch = json.items ?? [];
    items.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
    if (offset > 500) break;
  }
  return items;
}

async function deleteItem(itemId) {
  const { status } = await api("DELETE", `/item/${itemId}`);
  return status === 200 || status === 204;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !KUNDER_APP_ID || !KUNDER_APP_TOKEN) {
    console.error("Mangler Podio Kunder credentials i .env.local");
    process.exit(1);
  }

  const items = await listAllKunder();
  const byLeadId = new Map();

  for (const item of items) {
    const ext = (item.external_id ?? "").trim();
    const allioId = readTextField(item, "Allio Lead ID");
    const key = ext || allioId;
    if (!key) continue;
    if (LEAD_FILTER && key !== LEAD_FILTER && allioId !== LEAD_FILTER && ext !== LEAD_FILTER) continue;

    const list = byLeadId.get(key) ?? [];
    list.push({
      item_id: item.item_id,
      external_id: ext || null,
      allioLeadId: allioId || null,
      virksomhed: readTextField(item, "Virksomhed") || item.title || "?",
    });
    byLeadId.set(key, list);
  }

  let dupeGroups = 0;
  for (const [key, group] of byLeadId) {
    if (group.length <= 1) continue;
    dupeGroups++;
    console.log(`\nDublet-gruppe for lead ${key} (${group.length} items):`);
    for (const g of group) {
      console.log(
        `  item_id=${g.item_id} ext=${g.external_id ?? "—"} virksomhed=${g.virksomhed}`,
      );
    }

    if (DELETE_DUPES) {
      const canonical = group.find((g) => g.external_id === key);
      if (!canonical) {
        console.log("  ⚠ Ingen item med external_id=leadId — sletter intet automatisk");
        continue;
      }
      for (const g of group) {
        if (g.item_id === canonical.item_id) continue;
        const ok = await deleteItem(g.item_id);
        console.log(`  ${ok ? "✓ slettede" : "✖ fejl"} dublet item_id=${g.item_id}`);
      }
    }
  }

  if (dupeGroups === 0) {
    console.log("Ingen dublet-grupper fundet.");
  } else if (!DELETE_DUPES) {
    console.log("\nKør med --delete-duplicates for at fjerne dubletter uden canonical external_id.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

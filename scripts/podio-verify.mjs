/**
 * Verificér manuelt oprettede Podio-apps mod Allio-forventninger + fix Genaktivering.
 *
 * Kør: node scripts/podio-verify.mjs
 * Kræver PODIO_CLIENT_ID/SECRET + app-id/token pr. app i .env.local
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
    let val = m[2].trim();
    // Fjern inline-kommentar (fx PODIO_SPACE_ID="123" # note)
    val = val.replace(/\s+#.*$/, "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}
loadEnvLocal();

const CLIENT_ID = (process.env.PODIO_CLIENT_ID ?? "").trim();
const CLIENT_SECRET = (process.env.PODIO_CLIENT_SECRET ?? "").trim();

const APPS = {
  kunder: { id: process.env.PODIO_KUNDER_APP_ID, token: process.env.PODIO_KUNDER_APP_TOKEN, name: "Kunder" },
  moeder: { id: process.env.PODIO_MOEDER_APP_ID, token: process.env.PODIO_MOEDER_APP_TOKEN, name: "Møder" },
  processer: {
    id: process.env.PODIO_PROCESSER_APP_ID,
    token: process.env.PODIO_PROCESSER_APP_TOKEN,
    name: "Processer/Leverancer",
  },
  betaling: {
    id: process.env.PODIO_BETALING_APP_ID,
    token: process.env.PODIO_BETALING_APP_TOKEN,
    name: "Betalingsaftaler",
  },
  levering: {
    id: process.env.PODIO_LEVERING_APP_ID,
    token: process.env.PODIO_LEVERING_APP_TOKEN,
    name: "Leveringsmodeller",
  },
};

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

const EXPECTED = {
  kunder: {
    fields: {
      Virksomhed: ["text"],
      Kontaktperson: ["text"],
      Telefon: ["phone"],
      Email: ["email"],
      CVR: ["text"],
      Adresse: ["location"],
      Kontonummer: ["text"],
      Registreringsnummer: ["text"],
      "Booket af": ["text"],
      "Første mødelink": ["embed"],
      "Allio Lead ID": ["text"],
      "Cal booking uid": ["text"],
      Stadie: ["category"],
      Leveringsmodel: ["app"],
    },
    categories: { Stadie: STADIER },
  },
  moeder: {
    fields: {
      Kunde: ["app"],
      Type: ["category"],
      "Dato & tid": ["date"],
      "Kick-off dato": ["date"],
      Mødelink: ["embed"],
      Status: ["category"],
      "Fathom-noter": ["text"],
      Ansvarlig: ["text"],
    },
    categories: {
      Type: ["Onboarding", "Kick-off", "Strategi/Performance", "Årsmøde"],
      Status: ["Booket", "Afholdt", "Aflyst", "Genbook"],
    },
  },
  processer: {
    fields: {
      Proces: ["text"],
      Kunde: ["app"],
      Ansvarlig: ["text"],
      Status: ["category"],
      Noter: ["text"],
    },
    categories: { Status: ["Ikke startet", "I gang", "Færdig"] },
  },
  betaling: {
    fields: {
      Kunde: ["app"],
      Model: ["category"],
      Beløb: ["money"],
      Rabat: ["money", "number"],
      Bindingsperiode: ["text", "category"],
      "Betalingskort indsat": ["category"],
      Kontraktstatus: ["category"],
      Startdato: ["date"],
    },
    categories: {
      Model: ["No cure no pay", "Månedlig betaling", "12 mrd. binding"],
      "Betalingskort indsat": ["Ja", "Nej"],
      Kontraktstatus: ["Ikke sendt", "Sendt", "Accepteret"],
    },
  },
  levering: {
    fields: {
      Navn: ["text"],
      Beskrivelse: ["text"],
      Standardpris: ["money"],
      Stadier: ["text"],
    },
  },
};

const tokenCache = new Map();
let userToken = null;

async function userAuth() {
  if (userToken) return userToken;
  const body = new URLSearchParams({
    grant_type: "password",
    username: (process.env.PODIO_USERNAME ?? "").trim(),
    password: (process.env.PODIO_PASSWORD ?? "").trim(),
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Bruger-login fejlede: ${JSON.stringify(json).slice(0, 200)}`);
  userToken = json.access_token;
  return userToken;
}

async function userApi(method, pathname, body) {
  const token = await userAuth();
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: { Authorization: `OAuth2 ${token}`, "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function appToken(appKey) {
  if (tokenCache.has(appKey)) return tokenCache.get(appKey);
  const a = APPS[appKey];
  const body = new URLSearchParams({
    grant_type: "app",
    app_id: a.id,
    app_token: a.token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const res = await fetch(OAUTH, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const json = await res.json();
  if (!res.ok) throw new Error(`Token fejl (${appKey}): ${JSON.stringify(json).slice(0, 200)}`);
  tokenCache.set(appKey, json.access_token);
  return json.access_token;
}

async function api(appKey, method, pathname, body) {
  const token = await appToken(appKey);
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

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function fieldLabel(f) {
  return f.config?.label ?? f.label ?? "";
}

function catTexts(f) {
  return (f.config?.settings?.options ?? []).map((o) => o.text ?? o.status ?? "").filter(Boolean);
}

function verifyApp(appKey) {
  const spec = EXPECTED[appKey];
  const issues = [];
  const ok = [];

  return async () => {
    const { status, json } = await api(appKey, "GET", `/app/${APPS[appKey].id}`);
    if (status !== 200) {
      issues.push(`Kunne ikke hente app-config (HTTP ${status})`);
      return { issues, ok };
    }

    const byLabel = new Map(json.fields.map((f) => [norm(fieldLabel(f)), f]));

    for (const [label, allowedTypes] of Object.entries(spec.fields)) {
      const f = byLabel.get(norm(label));
      if (!f) {
        issues.push(`MANGLER felt: "${label}"`);
        continue;
      }
      if (!allowedTypes.includes(f.type)) {
        issues.push(
          `FORKERT type på "${label}": er "${f.type}", forventet ${allowedTypes.join(" eller ")} — ret manuelt i Podio (slet + opret felt igen)`,
        );
      } else {
        ok.push(`✓ ${label} (${f.type})`);
      }
    }

    for (const [catLabel, wantOpts] of Object.entries(spec.categories ?? {})) {
      const f = byLabel.get(norm(catLabel));
      if (!f) continue;
      const have = catTexts(f);
      for (const opt of wantOpts) {
        if (!have.some((h) => norm(h) === norm(opt))) {
          issues.push(`MANGLER kategori-valg i "${catLabel}": "${opt}"`);
        }
      }
      const extras = have.filter((h) => !wantOpts.some((w) => norm(w) === norm(h)));
      if (extras.length) {
        issues.push(`EKSTRA kategorier i "${catLabel}" (ok, men tjek stavemåde): ${extras.join(", ")}`);
      }
    }

    return { issues, ok, config: json };
  };
}

async function ensureGenaktivering() {
  const appKey = "levering";
  const a = APPS.levering;

  // Find via external_id
  let { status, json } = await api(appKey, "GET", `/item/app/${a.id}/external_id/genaktivering`);
  if (status === 200) {
    console.log("\n✓ Genaktivering findes allerede med external_id=genaktivering (item_id=" + json.item_id + ")");
    return;
  }

  // Find item med titel "Genaktivering" via filter
  const filterRes = await api(appKey, "POST", `/item/app/${a.id}/filter/`, {
    filters: {},
    limit: 50,
  });
  if (filterRes.status !== 200) {
    console.log("\n✖ Kunne ikke søge items i Leveringsmodeller:", filterRes.text.slice(0, 200));
    return;
  }

  const items = filterRes.json.items ?? [];
  const appConfig = (await api(appKey, "GET", `/app/${a.id}`)).json;
  const navnField = appConfig.fields.find((f) => norm(fieldLabel(f)) === norm("Navn"));
  const navnExt = navnField?.external_id;

  let target = items.find((item) => {
    const title = item.title ?? item.fields?.find((f) => f.field_id === navnField?.field_id)?.values?.[0]?.value;
    return norm(title) === norm("Genaktivering");
  });

  if (!target && items.length === 1) {
    target = items[0];
    console.log("\n→ Fandt ét item i Leveringsmodeller — antager det er Genaktivering:", target.title ?? target.item_id);
  }

  if (target) {
    const upd = await api(appKey, "PUT", `/item/${target.item_id}`, { external_id: "genaktivering" });
    if (upd.status === 200 || upd.status === 204) {
      console.log(`\n✓ Sat external_id=genaktivering på item ${target.item_id}`);
      return;
    }
    console.log("\n✖ Kunne ikke sætte external_id:", upd.text.slice(0, 300));
    return;
  }

  // Opret nyt item
  const fields = {};
  if (navnExt) fields[navnExt] = "Genaktivering";
  const beskField = appConfig.fields.find((f) => norm(fieldLabel(f)) === norm("Beskrivelse"));
  if (beskField) fields[beskField.external_id] = "Genaktiverings-pakke (standard leveringsmodel).";
  const stadField = appConfig.fields.find((f) => norm(fieldLabel(f)) === norm("Stadier"));
  if (stadField) {
    fields[stadField.external_id] = STADIER.join(" → ");
  }

  const create = await api(appKey, "POST", `/item/app/${a.id}/`, {
    external_id: "genaktivering",
    fields,
  });
  if (create.status === 200 || create.status === 201) {
    console.log("\n✓ Oprettede Genaktivering-item med external_id=genaktivering");
  } else {
    console.log("\n✖ Kunne ikke oprette Genaktivering:", create.text.slice(0, 400));
  }
}

async function addField(appKey, fieldDef) {
  const a = APPS[appKey];
  const label = fieldDef.config.label;
  const res = await userApi("POST", `/app/${a.id}/field/`, fieldDef);
  if (res.status === 200 || res.status === 201) {
    console.log(`  + Tilføjede felt "${label}" i ${a.name}`);
    return true;
  }
  console.log(`  ✖ Kunne ikke tilføje "${label}": ${res.text.slice(0, 200)}`);
  return false;
}

const COLORS = ["DCEBD8", "F7F0C9", "FFD5C2", "D2E5FF", "E0E0E0", "F4A1A1"];
function catField(label, options) {
  return {
    type: "category",
    config: {
      label,
      settings: {
        options: options.map((text, i) => ({ status: "active", text, color: COLORS[i % COLORS.length] })),
        multiple: false,
        display: "list",
      },
    },
  };
}

async function fixMissingFields() {
  console.log("\n=== Retter manglende felter via API ===");

  await addField("moeder", { type: "embed", config: { label: "Mødelink" } });

  await addField("processer", catField("Status", ["Ikke startet", "I gang", "Færdig"]));

  await addField("betaling", catField("Betalingskort indsat", ["Ja", "Nej"]));
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Mangler PODIO_CLIENT_ID / PODIO_CLIENT_SECRET");
    process.exit(1);
  }

  let totalIssues = 0;

  for (const appKey of Object.keys(APPS)) {
    const a = APPS[appKey];
    console.log(`\n=== ${a.name} (app_id=${a.id}) ===`);
    if (!a.id || !a.token) {
      console.log("✖ Mangler app-id eller token i .env.local");
      totalIssues++;
      continue;
    }

    try {
      const { issues, ok } = await verifyApp(appKey)();
      for (const line of ok) console.log(line);
      for (const line of issues) {
        console.log("⚠", line);
        totalIssues++;
      }
      if (!issues.length) console.log("→ Alt ser korrekt ud.");
    } catch (err) {
      console.log("✖", err.message);
      totalIssues++;
    }
  }

  try {
    await ensureGenaktivering();
  } catch (err) {
    console.log("\n✖ Genaktivering-fix fejlede:", err.message);
    totalIssues++;
  }

  if (process.argv.includes("--fix")) {
    try {
      await fixMissingFields();
    } catch (err) {
      console.log("\n✖ Auto-fix fejlede:", err.message);
    }
    console.log("\n--- Genkør verifikation efter fix ---");
    totalIssues = 0;
    for (const appKey of Object.keys(APPS)) {
      const a = APPS[appKey];
      console.log(`\n=== ${a.name} (app_id=${a.id}) ===`);
      if (!a.id || !a.token) continue;
      try {
        const { issues, ok } = await verifyApp(appKey)();
        for (const line of ok) console.log(line);
        for (const line of issues) {
          console.log("⚠", line);
          totalIssues++;
        }
        if (!issues.length) console.log("→ Alt ser korrekt ud.");
      } catch (err) {
        console.log("✖", err.message);
        totalIssues++;
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  if (totalIssues === 0) {
    console.log("FÆRDIG: Ingen problemer fundet. Allio burde kunne synce.");
  } else {
    console.log(`FÆRDIG: ${totalIssues} ting skal rettes (se ⚠ ovenfor).`);
    console.log("Felttyper kan ikke ændres via API — slet felt og opret med rigtig type i Podio UI.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

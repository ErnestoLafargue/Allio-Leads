/**
 * Tjek at Podio/Cal.eu-credentials er sat i .env.local (Sensitive Vercel-vars kan ikke pulles).
 *
 * Brug: node scripts/check-local-env.mjs
 */

import fs from "node:fs";
import path from "node:path";

const REQUIRED = [
  "PODIO_CLIENT_ID",
  "PODIO_CLIENT_SECRET",
  "PODIO_MOEDER_APP_ID",
  "PODIO_MOEDER_APP_TOKEN",
  "CALCOM_HOST",
  "CALCOM_API_KEY",
  "CALCOM_EVENT_TYPE_ID",
];

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim().replace(/\s+#.*$/, "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnvLocal();
const missing = REQUIRED.filter((k) => !(env[k] ?? "").trim());
const ok = REQUIRED.filter((k) => (env[k] ?? "").trim());

console.log("Podio/Cal.eu env check (.env.local)\n");
if (ok.length) {
  console.log("Sat:");
  for (const k of ok) console.log(`  ✓ ${k}`);
}
if (missing.length) {
  console.log("\nMangler (kopier fra Vercel → Settings → Environment Variables → Production → Reveal):");
  for (const k of missing) console.log(`  ✖ ${k}`);
  console.log("\nVercel markerer dem som Sensitive — vercel env pull kan ikke hente værdierne.");
  console.log("Indsæt dem manuelt i .env.local og genstart: npm run dev:remote");
  process.exit(1);
}
console.log("\n✓ Alle Podio/Cal.eu-nøgler er sat — localhost kan synce til Podio og Cal.eu.");

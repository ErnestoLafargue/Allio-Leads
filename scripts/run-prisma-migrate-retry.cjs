/**
 * Robust migrate deploy for CI/build:
 * retries Prisma migrate when advisory-lock/network timeouts happen.
 * Prefererer direkte (ikke-pooler) Neon-URL, så session-advisory-locks ikke hænger i PgBouncer.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const maxAttempts = Number(process.env.PRISMA_MIGRATE_MAX_ATTEMPTS || 6);
const delayMs = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || 6000);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Neon pooler-host → direkte compute-host (advisory locks kræver sticky session). */
function neonDirectDatabaseUrl(url) {
  if (typeof url !== "string" || !url) return url;
  return url.replace(/-pooler\./g, ".");
}

function migrateEnv() {
  const env = { ...process.env };
  const preferred =
    process.env.DIRECT_URL?.trim() ||
    process.env.DATABASE_URL_UNPOOLED?.trim() ||
    process.env.POSTGRES_URL_NON_POOLING?.trim() ||
    neonDirectDatabaseUrl(process.env.DATABASE_URL);
  if (preferred) {
    env.DATABASE_URL = preferred;
    if (preferred !== process.env.DATABASE_URL) {
      console.log("[migrate] Using direct/non-pooled DATABASE_URL for migrate deploy");
    }
  }
  return env;
}

function runOnce(args) {
  return spawnSync("npx", ["prisma", ...args], {
    stdio: "inherit",
    shell: true,
    env: migrateEnv(),
    cwd: root,
  });
}

function databaseLooksUpToDate() {
  const result = spawnSync("npx", ["prisma", "migrate", "status"], {
    encoding: "utf8",
    shell: true,
    env: migrateEnv(),
    cwd: root,
  });
  const out = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/Database schema is up to date/i.test(out) || /No pending migrations/i.test(out)) {
    return true;
  }
  // Prisma prints "Following migrations have not yet been applied" when pending.
  if (/have not yet been applied/i.test(out)) return false;
  return result.status === 0;
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`[migrate] Attempt ${attempt}/${maxAttempts}`);
  const result = runOnce(["migrate", "deploy"]);
  const code = result.status === null ? 1 : result.status;
  if (code === 0) process.exit(0);
  if (attempt < maxAttempts) {
    console.warn(`[migrate] Failed attempt ${attempt}. Retrying in ${delayMs}ms...`);
    sleep(delayMs);
  }
}

if (databaseLooksUpToDate()) {
  console.warn(
    "[migrate] Deploy failed (likely advisory lock), but migrate status reports up to date — continuing build.",
  );
  process.exit(0);
}

console.error("[migrate] Failed after all retry attempts.");
process.exit(1);

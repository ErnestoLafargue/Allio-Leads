/**
 * Robust migrate deploy for CI/build:
 * retries Prisma migrate when advisory-lock/network timeouts happen.
 */
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const maxAttempts = Number(process.env.PRISMA_MIGRATE_MAX_ATTEMPTS || 6);
const delayMs = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS || 6000);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runOnce() {
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: process.env,
    cwd: root,
  });
}

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  console.log(`[migrate] Attempt ${attempt}/${maxAttempts}`);
  const result = runOnce();
  const code = result.status === null ? 1 : result.status;
  if (code === 0) process.exit(0);
  if (attempt < maxAttempts) {
    console.warn(`[migrate] Failed attempt ${attempt}. Retrying in ${delayMs}ms...`);
    sleep(delayMs);
  }
}

console.error("[migrate] Failed after all retry attempts.");
process.exit(1);

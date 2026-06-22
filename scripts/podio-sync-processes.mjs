#!/usr/bin/env node
/**
 * Wrapper — kør proces-sync mod Podio for en kunde.
 *
 *   node scripts/podio-sync-processes.mjs <leadId|kundeItemId>
 *
 * Kræver .env.local (source den først) og npx tsx.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const tsPath = path.join(dir, "podio-sync-processes.ts");

const result = spawnSync("npx", ["tsx", tsPath, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: path.resolve(dir, ".."),
  env: process.env,
});

process.exit(result.status ?? 1);

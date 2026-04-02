/**
 * Kører `prisma migrate deploy` med samme env som Next.js lokalt:
 * indlæser `.env.local` derefter `.env` (Prisma CLI læser kun `.env` som standard).
 */
const { config } = require("dotenv");
const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
config({ path: path.join(root, ".env.local") });
config({ path: path.join(root, ".env") });

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL er ikke sat. Tilføj den i .env.local (eller .env) og prøv igen.",
  );
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
  cwd: root,
});

process.exit(r.status === null ? 1 : r.status);

/**
 * Kopierer produktviden fra docs/allio.md ind i lib/allio-knowledge.ts, så den kommer med i
 * Vercel-bygget og kan bruges i AI-prompts. Kør efter hver ændring i docs/allio.md:
 *   npx tsx scripts/sync-allio-knowledge.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync("docs/allio.md", "utf8").trim();
const escaped = md.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
writeFileSync(
  "lib/allio-knowledge.ts",
  `/**
 * GENERERET fra docs/allio.md af scripts/sync-allio-knowledge.ts — ret i docs/allio.md, ikke her.
 * Allios komplette produktviden til AI'en (live-coach, øve-tilstand, indvendingsbog).
 */
export const ALLIO_KNOWLEDGE = \`${escaped}\`;
`,
);
console.log(`lib/allio-knowledge.ts opdateret (${md.split(/\s+/).length} ord)`);

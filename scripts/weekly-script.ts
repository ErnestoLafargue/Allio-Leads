/**
 * Ugens script — tre måder:
 *   --export <dir>   Skriv prompt + input (evidenspakke) til en Claude-session (første gang, uden API).
 *   --publish <dir>  Validér <dir>/out.json mod skemaet og evidenspakken, og udgiv (kilde "session").
 *   --api            Generér og udgiv direkte via Claude API'et (sådan kører det fremover).
 *
 * Brug:  set -a; . ./.env.local; . ./.env.branch; set +a
 *        npx tsx --tsconfig tsconfig.json scripts/weekly-script.ts --export /root/allio-analysis/weekly
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertExpectedDatabase } from "@/lib/db-guard";
import { prisma } from "@/lib/prisma";
import { evidenceCallIds, type EvidencePack } from "@/lib/sales-scripts/evidence";
import { buildWeeklyScriptInput, generateWeeklyScriptViaApi } from "@/lib/sales-scripts/generate";
import { WEEKLY_SCRIPT_PROMPT_VERSION, WEEKLY_SCRIPT_SYSTEM_PROMPT } from "@/lib/sales-scripts/prompt";
import { publishWeeklyScript, sanitizeWeeklyScript } from "@/lib/sales-scripts/publish";
import { weeklyScriptJsonSchema } from "@/lib/sales-scripts/schema";

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  assertExpectedDatabase();
  const exportDir = arg("--export");
  const publishDir = arg("--publish");

  if (exportDir) {
    const { userMessage, evidence, basedOnCalls } = await buildWeeklyScriptInput();
    await mkdir(exportDir, { recursive: true });
    await writeFile(
      path.join(exportDir, "prompt.md"),
      [
        `# Ugens script — ${WEEKLY_SCRIPT_PROMPT_VERSION}`,
        "",
        "Læs input.md og skriv ét JSON-objekt, der følger skemaet, til out.json (kun JSON).",
        "",
        "## Systemprompt",
        "",
        WEEKLY_SCRIPT_SYSTEM_PROMPT,
        "",
        "## JSON-skema",
        "",
        "```json",
        JSON.stringify(weeklyScriptJsonSchema(), null, 1),
        "```",
        "",
      ].join("\n"),
    );
    await writeFile(path.join(exportDir, "input.md"), userMessage);
    await writeFile(path.join(exportDir, "evidence.json"), JSON.stringify({ basedOnCalls, evidence }));
    console.log(`Eksporteret til ${exportDir} (${basedOnCalls} salgssamtaler, ${userMessage.length} tegn input)`);
    return;
  }

  if (publishDir) {
    const { basedOnCalls, evidence } = JSON.parse(await readFile(path.join(publishDir, "evidence.json"), "utf8")) as {
      basedOnCalls: number;
      evidence: EvidencePack;
    };
    const raw = JSON.parse((await readFile(path.join(publishDir, "out.json"), "utf8")).replace(/^```(json)?\s*|\s*```\s*$/g, ""));
    const script = sanitizeWeeklyScript(raw, evidenceCallIds(evidence));
    const published = await publishWeeklyScript({
      script,
      evidence,
      basedOnCalls,
      generatedBy: "session",
      promptVersion: WEEKLY_SCRIPT_PROMPT_VERSION,
    });
    console.log(`Udgivet ugens script version ${published.version} (${script.title})`);
    return;
  }

  if (process.argv.includes("--api")) {
    const r = await generateWeeklyScriptViaApi();
    console.log(`Udgivet ugens script version ${r.version} via API — pris $${r.costUsd.toFixed(4)}`);
    return;
  }

  throw new Error("Brug --export <dir>, --publish <dir> eller --api");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Input til ugens script (fælles for Claude-sessionen og API'et) og generering via API'et.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAnthropicClient, structuredCall } from "@/lib/anthropic-client";
import { prisma } from "@/lib/prisma";
import { loadAnalyzedCalls } from "@/lib/scripts-traening/analyzed-calls";
import { buildEvidencePack, evidenceCallIds, type EvidencePack } from "./evidence";
import { WEEKLY_SCRIPT_PROMPT_VERSION, WEEKLY_SCRIPT_SYSTEM_PROMPT, buildWeeklyScriptUserMessage } from "./prompt";
import { isoWeekKey, publishWeeklyScript, sanitizeWeeklyScript } from "./publish";
import { WeeklyScriptSchema, type WeeklyScript } from "./schema";

/** Grundscriptet: den nyeste pitch (docs/salgsscripts/pitch-nynyny.md). */
export const BASE_SCRIPT = { name: "Pitch NyNyNy", file: "docs/salgsscripts/pitch-nynyny.md" };

export async function buildWeeklyScriptInput(
  now = new Date(),
): Promise<{ userMessage: string; evidence: EvidencePack; basedOnCalls: number }> {
  const calls = await loadAnalyzedCalls({});
  const evidence = buildEvidencePack(calls);
  const [baseScript, previous] = await Promise.all([
    readFile(path.join(process.cwd(), BASE_SCRIPT.file), "utf8"),
    prisma.salesScriptVersion.findFirst({ where: { kind: "WEEKLY", isActive: true }, select: { content: true } }),
  ]);
  const userMessage = buildWeeklyScriptUserMessage({
    weekKey: isoWeekKey(now),
    baseScriptName: BASE_SCRIPT.name,
    baseScript,
    evidence,
    previous: previous ? (previous.content as unknown as WeeklyScript) : null,
  });
  return { userMessage, evidence, basedOnCalls: evidence.totals.salesConversations };
}

/** Genererer og udgiver ugens script via Claude API'et (workeren/scriptet — ingen godkendelse). */
export async function generateWeeklyScriptViaApi(client = createAnthropicClient(), now = new Date()) {
  const { userMessage, evidence, basedOnCalls } = await buildWeeklyScriptInput(now);
  const { output, costUsd } = await structuredCall({
    client,
    system: WEEKLY_SCRIPT_SYSTEM_PROMPT,
    userMessage,
    schema: WeeklyScriptSchema,
    maxTokens: 32000,
  });
  const script = sanitizeWeeklyScript(output, evidenceCallIds(evidence));
  const published = await publishWeeklyScript({
    script,
    evidence,
    basedOnCalls,
    generatedBy: "api",
    promptVersion: WEEKLY_SCRIPT_PROMPT_VERSION,
    costUsd,
    now,
  });
  return { ...published, costUsd };
}

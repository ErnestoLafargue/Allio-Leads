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
import { POLISH_PROMPT_VERSION, polishWeeklyScript } from "./polish";
import { isoWeekKey, publishWeeklyScript, sanitizeWeeklyScript } from "./publish";
import { WeeklyScriptSchema, type WeeklyScript } from "./schema";

/** Grundscriptet: den nyeste pitch (docs/salgsscripts/pitch-8.md). */
export const BASE_SCRIPT = { name: "Pitch 8", file: "docs/salgsscripts/pitch-8.md" };

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
  const draft = await structuredCall({
    client,
    system: WEEKLY_SCRIPT_SYSTEM_PROMPT,
    userMessage,
    schema: WeeklyScriptSchema,
    maxTokens: 32000,
  });
  // Lag 2: finpudsning til ét sammenhængende manuskript (samme evidens, ingen nye tal).
  const polished = await polishWeeklyScript(client, sanitizeWeeklyScript(draft.output, evidenceCallIds(evidence)));
  const script = sanitizeWeeklyScript(polished.script, evidenceCallIds(evidence));
  const costUsd = draft.costUsd + polished.costUsd;
  const published = await publishWeeklyScript({
    script,
    evidence,
    basedOnCalls,
    generatedBy: "api",
    promptVersion: `${WEEKLY_SCRIPT_PROMPT_VERSION}+${POLISH_PROMPT_VERSION}`,
    costUsd,
    now,
  });
  return { ...published, costUsd };
}

/** Finpudser det aktive ugens script (lag 2) og udgiver det som ny version med samme evidens. */
export async function polishActiveWeeklyScript(client = createAnthropicClient(), now = new Date()) {
  const active = await prisma.salesScriptVersion.findFirst({
    where: { kind: "WEEKLY", isActive: true },
    select: { content: true, evidence: true, basedOnCalls: true, promptVersion: true },
  });
  if (!active) throw new Error("Der er intet aktivt ugens script at finpudse.");
  const evidence = active.evidence as unknown as EvidencePack;
  const allowed = evidenceCallIds(evidence);
  const { script, costUsd } = await polishWeeklyScript(client, active.content as unknown as WeeklyScript);
  const published = await publishWeeklyScript({
    script: sanitizeWeeklyScript(script, allowed),
    evidence,
    basedOnCalls: active.basedOnCalls,
    generatedBy: "api",
    promptVersion: `${active.promptVersion}+${POLISH_PROMPT_VERSION}`,
    costUsd,
    now,
  });
  return { ...published, costUsd };
}

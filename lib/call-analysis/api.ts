/**
 * Analyse af én samtale via Claude API'et (workeren) — samme systemprompt og skema som i
 * Claude-sessionen. Systemprompten caches, så kun transskriptionen betales fuldt pr. samtale.
 *
 * Model: Claude Haiku 5.5 med effort «high» (ANALYSIS_MODEL/ANALYSIS_EFFORT kan overstyre).
 * Kvalitetstest mod Opus på guldsættet (scripts/model-eval.ts, 30 samtaler): 0 citatfejl, score
 * ±7 point, ~$0,006 pr. samtale — mod ~$0,09 for Opus 5.
 */
import { createAnthropicClient, structuredCall } from "@/lib/anthropic-client";

export const ANALYSIS_MODEL = process.env.ANALYSIS_MODEL?.trim() || "claude-haiku-5-5";
const ANALYSIS_EFFORT = (process.env.ANALYSIS_EFFORT?.trim() || "high") as "low" | "medium" | "high" | "xhigh" | "max";
import { ANALYSIS_SYSTEM_PROMPT } from "./prompt";
import { CallAnalysisSchema } from "./schema";
import { loadAnalysisInput, saveCallAnalysis } from "./store";

export async function analyzeCallViaApi(
  callRecordingId: string,
  client = createAnthropicClient(),
): Promise<{ overall: number | null; warnings: string[]; costUsd: number; model: string }> {
  const { userMessage } = await loadAnalysisInput(callRecordingId);
  const { output, usage, costUsd, model } = await structuredCall({
    client,
    system: ANALYSIS_SYSTEM_PROMPT,
    userMessage,
    schema: CallAnalysisSchema,
    maxTokens: 32000,
    model: ANALYSIS_MODEL,
    effort: ANALYSIS_EFFORT,
  });
  const saved = await saveCallAnalysis({
    callRecordingId,
    raw: output,
    source: "api",
    model,
    inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    costUsd,
  });
  return { ...saved, costUsd, model };
}

/**
 * Analyse af én samtale via Claude API'et (workeren) — samme systemprompt og skema som i
 * Claude-sessionen. Systemprompten caches, så kun transskriptionen betales fuldt pr. samtale.
 */
import { createAnthropicClient, structuredCall } from "@/lib/anthropic-client";
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

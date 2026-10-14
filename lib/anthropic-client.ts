/**
 * Claude API-klient til workeren (analyse af nye samtaler og ugens script).
 *
 * - Nøglen er org-scoped: hvert kald sender headeren anthropic-workspace-id (ANTHROPIC_WORKSPACE_ID).
 * - claude-opus-5 med server-side refusal-fallback ("default"), så et afslag automatisk køres igen på
 *   Anthropics anbefalede model i stedet for at fejle.
 * - Pris beregnes pr. kald ud fra usage (inkl. prompt caching) og logges pr. samtale.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";

export const CLAUDE_MODEL = "claude-opus-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };
/** USD pr. 1M tokens (listepriser); cache-skriv 1,25× og cache-læs 0,1× input. */
const PRICES: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
/** Modeller med server-side refusal-fallback ("default"-formen) på Claude API'et. */
const FALLBACK_MODELS: ReadonlySet<string> = new Set(["claude-opus-5", "claude-opus-5-5", "claude-sonnet-5-5"]);

/**
 * Nøglen: ANTHROPIC_API_KEY, ellers ALLIO_ANTHROPIC_API_KEY (Claude Code-cloudmiljøer reserverer
 * ANTHROPIC_API_KEY til Claude Code selv, så den når ikke scripts, der køres derfra).
 */
export function anthropicApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY?.trim() || process.env.ALLIO_ANTHROPIC_API_KEY?.trim() || undefined;
}

export function createAnthropicClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: anthropicApiKey(),
    ...(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {}),
  });
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function usageCostUsd(u: Usage, model: string = CLAUDE_MODEL): number {
  const price = PRICES[model] ?? PRICES[CLAUDE_MODEL]!;
  return (
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      (u.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  );
}

/** Fejl fra et Claude-kald, der alligevel har kostet noget (prisen logges pr. samtale). */
export class ClaudeCallError extends Error {
  constructor(
    message: string,
    readonly costUsd: number,
  ) {
    super(message);
  }
}

/**
 * Ét struktureret kald (JSON-skema fra zod) med cachet systemprompt. Svaret streames, så lange svar
 * ikke rammer SDK'ens tidsgrænse, og prisen beregnes også, når svaret afvises eller bliver afskåret.
 */
export async function structuredCall<S extends z.ZodType>(params: {
  client: Anthropic;
  system: string;
  userMessage: string;
  schema: S;
  maxTokens: number;
  /** Standard: CLAUDE_MODEL. */
  model?: string;
  /** Tænkedybde (output_config.effort); standard er modellens egen. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}): Promise<{ output: z.infer<S>; usage: Usage; costUsd: number; model: string }> {
  const model = params.model ?? CLAUDE_MODEL;
  const stream = params.client.beta.messages.stream({
    model,
    max_tokens: params.maxTokens,
    ...(FALLBACK_MODELS.has(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: params.userMessage }],
    output_config: { format: betaZodOutputFormat(params.schema), ...(params.effort ? { effort: params.effort } : {}) },
  });
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };
  let stopReason: string | null = null;
  stream.on("streamEvent", (event) => {
    if (event.type === "message_start") usage = { ...event.message.usage };
    if (event.type === "message_delta") {
      usage = { ...usage, output_tokens: event.usage.output_tokens };
      stopReason = event.delta.stop_reason;
    }
  });

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    const costUsd = usageCostUsd(usage, model);
    const reason = stopReason === "max_tokens" ? "svaret blev afskåret (max_tokens)" : "svaret kunne ikke læses";
    throw new ClaudeCallError(
      `Claude: ${reason} — ${err instanceof Error ? err.message : String(err)} — pris $${costUsd.toFixed(4)}`,
      costUsd,
    );
  }
  const costUsd = usageCostUsd(message.usage, model);
  if (message.stop_reason === "refusal") {
    throw new ClaudeCallError(
      `Claude afviste (${message.stop_details?.category ?? "ukendt kategori"}) — pris $${costUsd.toFixed(4)}`,
      costUsd,
    );
  }
  if (message.stop_reason === "max_tokens" || !message.parsed_output) {
    throw new ClaudeCallError(`Claude: intet gyldigt svar (stop_reason=${message.stop_reason}) — pris $${costUsd.toFixed(4)}`, costUsd);
  }
  return { output: message.parsed_output, usage: message.usage, costUsd, model: message.model };
}

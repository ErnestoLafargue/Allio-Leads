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

/** claude-opus-5 (USD pr. 1M tokens): input 5, output 25; cache-skriv 1,25×, cache-læs 0,1× input. */
const PRICE = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };

export function createAnthropicClient(): Anthropic {
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function usageCostUsd(u: Usage): number {
  return (
    (u.input_tokens * PRICE.input +
      u.output_tokens * PRICE.output +
      (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead) /
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
}): Promise<{ output: z.infer<S>; usage: Usage; costUsd: number; model: string }> {
  const stream = params.client.beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: params.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: params.userMessage }],
    output_config: { format: betaZodOutputFormat(params.schema) },
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
    const costUsd = usageCostUsd(usage);
    const reason = stopReason === "max_tokens" ? "svaret blev afskåret (max_tokens)" : "svaret kunne ikke læses";
    throw new ClaudeCallError(
      `Claude: ${reason} — ${err instanceof Error ? err.message : String(err)} — pris $${costUsd.toFixed(4)}`,
      costUsd,
    );
  }
  const costUsd = usageCostUsd(message.usage);
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

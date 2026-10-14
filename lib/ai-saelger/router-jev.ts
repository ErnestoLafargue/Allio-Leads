/**
 * Routeren som kald: Jev (TypeSafe AI) med Choice (menuen) og Noul («skal Adrian bryde ind nu?»).
 * Endpoint og format er fra TypeSafes eget SDK (@typesafe-ai/sdk 0.6): POST https://api.typesafe.ai/v1/systemone
 * med `Authorization: Bearer $TYPESAFE_API_KEY` og `{ model, state, questions }`. Claude Haiku er reserve
 * (routerSystemPrompt + parseRouterLabel).
 */
import { choice, noul, TypeSafeClient } from "@typesafe-ai/sdk";
import { BARGE_IN_LABELS, ROUTER_LABELS, ROUTER_MENU, type RouterLabel } from "./router";

export const JEV_MODEL = process.env.TYPESAFE_DEFAULT_MODEL?.trim() || "jev-latest";

const KONTEKST =
  "Dansk telefonsamtale. En mødebooker fra Allio ringer til en klinik (hudpleje, frisør, fysioterapi o.l.). " +
  "Allio er hverken marketingbureau, nyt bookingsystem eller sælger: det er et lag oven på klinikkens bookingsystem, " +
  "der får inaktive kunder tilbage. Teksten er kundens seneste tur og kan være ufærdig.";

export const ROUTER_CHOICE = choice("Hvad gør kunden i sin seneste tur?", ROUTER_MENU);

export const BARGE_IN_NOUL = noul(
  "Skal mødebookeren bryde ind nu, mens kunden stadig taler?",
  {
    true:
      "Ja: kunden har en forkert antagelse om, hvad Allio er (marketingbureau, at de skal skifte bookingsystem, " +
      "unødvendige ekstra udgifter, eller at vi er sælgere), eller kunden taler længe uden at komme nogen vegne.",
    false: "Nej: lad kunden tale færdig (indvending, spørgsmål, svar, positivt signal, nej tak eller bare «mm»).",
  },
);

export type JevRoute = {
  label: RouterLabel;
  confidence: number;
  probabilities: Record<RouterLabel, number>;
  /** Sandsynlighed for, at agenten skal bryde ind nu. */
  bargeIn: number;
  ms: number;
  inputTokens: number;
};

export function createJevClient(): TypeSafeClient {
  // Routeren skal være hurtig: ét forsøg med kort timeout, så Haiku kan tage over.
  return new TypeSafeClient({ defaultModel: JEV_MODEL, timeout: 3000, retry: { maxRetries: 0 } });
}

/** Ét kald med begge spørgsmål (Choice + Noul). */
export async function routeWithJev(client: TypeSafeClient, kundensTur: string, sidsteAgentReplik?: string): Promise<JevRoute> {
  const t0 = performance.now();
  const r = await client.systemOne({
    state: { kontekst: KONTEKST, ...(sidsteAgentReplik ? { moedebookeren_sagde: sidsteAgentReplik } : {}), kundens_tur: kundensTur },
    questions: { label: ROUTER_CHOICE, bryd_ind: BARGE_IN_NOUL },
  });
  const ms = performance.now() - t0;
  const label = (ROUTER_LABELS as readonly string[]).includes(r.answers.label.choice) ? (r.answers.label.choice as RouterLabel) : "andet";
  return {
    label,
    confidence: r.answers.label.confidence,
    probabilities: r.answers.label.probabilities as Record<RouterLabel, number>,
    bargeIn: r.answers.bryd_ind.noul,
    ms,
    inputTokens: r.usage.input_tokens,
  };
}

/** Kun Noul (det billige kald ca. hver 6. ord, mens kunden taler). */
export async function bargeInWithJev(
  client: TypeSafeClient,
  foreloebigTekst: string,
  sidsteAgentReplik?: string,
): Promise<{ p: number; ms: number }> {
  const t0 = performance.now();
  const r = await client.systemOne({
    state: { kontekst: KONTEKST, ...(sidsteAgentReplik ? { moedebookeren_sagde: sidsteAgentReplik } : {}), kundens_tur: foreloebigTekst },
    questions: { bryd_ind: BARGE_IN_NOUL },
  });
  return { p: r.answers.bryd_ind.noul, ms: performance.now() - t0 };
}

export const shouldBargeInLabel = (l: RouterLabel) => BARGE_IN_LABELS.has(l);

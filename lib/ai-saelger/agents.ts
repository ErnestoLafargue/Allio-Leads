/**
 * AI-mødebookerne: persona, stemmer og varianter. I starten kører 9 agenter samtidig (3 tilgange × 3
 * stemmer). Hvert opkald logger sin variant, så bookingraten kan sammenlignes og den bedste vælges.
 */

export type AgentName = "Adrian" | "Katrine";

export type Voice = {
  key: string;
  agentName: AgentName;
  provider: "elevenlabs";
  voiceId: string;
  model: string;
  /** Modellen forstår lyd-tags som [laughs] og [sighs]. */
  audioTags: boolean;
};

/** Valgt af Ernesto efter lyttetesten 14/10: 2× Isabella (Katrine) og 1× Christian (Adrian). */
export const VOICES: readonly Voice[] = [
  { key: "isabella-v3c", agentName: "Katrine", provider: "elevenlabs", voiceId: "gIfqD5jrnhkFu8ENVbXC", model: "eleven_v3_conversational", audioTags: true },
  { key: "isabella-v4t", agentName: "Katrine", provider: "elevenlabs", voiceId: "gIfqD5jrnhkFu8ENVbXC", model: "eleven_v4_turbo", audioTags: false },
  { key: "christian-v3c", agentName: "Adrian", provider: "elevenlabs", voiceId: "6SjhOkgKPuHxm8q0eIyp", model: "eleven_v3_conversational", audioTags: true },
];

export type ApproachKey = "aerlig" | "direkte" | "spoergende";

/** De 3 tilgange. Indholdet (playbooks) skrives sammen med Ernesto. */
export const APPROACHES: Readonly<Record<ApproachKey, { label: string; summary: string }>> = {
  aerlig: {
    label: "Den ærlige mødebooker",
    summary: "Ernestos åbning: «Jeg skal være ærlig med dig, jeg er mødebooker …», derefter pitchen og et spørgsmål.",
  },
  direkte: {
    label: "Kort og direkte",
    summary: "Går straks til kundens eget problem (inaktive kunder) og beder om mødet tidligt.",
  },
  spoergende: {
    label: "Spørgsmålsdrevet",
    summary: "Kunden taler mest. Adrian stiller spørgsmål, til kunden selv siger, hvad de mangler, og knytter mødet til det.",
  },
};

export type Variant = { key: string; approach: ApproachKey; voice: Voice };

/** Alle kombinationer af tilgang og stemme (3 × 3 = 9). */
export function allVariants(): Variant[] {
  return (Object.keys(APPROACHES) as ApproachKey[]).flatMap((approach) =>
    VOICES.map((voice) => ({ key: `${approach}/${voice.key}`, approach, voice })),
  );
}

/**
 * Talesprog til tekst-til-tale: navnet Katrine skal udtales på dansk. Modellerne får sproget "da"
 * med, men hvis en stemme alligevel siger det engelsk, retter vi stavningen her ét sted.
 */
export const PRONUNCIATION: Readonly<Record<string, string>> = {};

export function forSpeech(text: string, voice: Voice): string {
  let out = text;
  for (const [from, to] of Object.entries(PRONUNCIATION)) out = out.replaceAll(from, to);
  if (!voice.audioTags) out = out.replace(/\s*\[[a-z ]+\]\s*/gi, " ");
  return out.replace(/\s+/g, " ").trim();
}

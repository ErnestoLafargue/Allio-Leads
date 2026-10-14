/**
 * Stemmer ud over de faste i VOICES: Ernestos egen stemme (ElevenLabs Professional Voice Clone, trænet på ca.
 * 74 min af hans egne salgsopkald; trænet til Turbo v2.5, Flash v2.5 og Multilingual v2).
 * Voice-id'et ligger i AppSetting «ernesto-voice-id», så stemmen kan skiftes (fx til en Professional Voice
 * Clone) uden deploy.
 */
import { prisma } from "@/lib/prisma";
import { VOICES, type Voice } from "./agents";

export const ERNESTO_VOICE_SETTING_KEY = "ernesto-voice-id";
export const ERNESTO_VOICE_KEY = "ernesto-v3c";

export async function ernestoVoiceId(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: ERNESTO_VOICE_SETTING_KEY } });
  return row?.value || null;
}

/** Ernestos stemme som Voice (agenten hedder stadig Adrian), eller null hvis den ikke er optaget. */
export async function ernestoVoice(): Promise<Voice | null> {
  const id = await ernestoVoiceId();
  return id ? { key: ERNESTO_VOICE_KEY, agentName: "Adrian", provider: "elevenlabs", voiceId: id, model: "eleven_v3_conversational", audioTags: true } : null;
}

/**
 * Stemmer til samtaler i realtid: samme stemmer på ElevenLabs Flash v2.5, der kan få teksten før med
 * (previous_text), så tonen hænger sammen fra sætning til sætning (v3 Conversational kan ikke). Målt ca.
 * 0,25 s til første lyd. Ikke en del af de 9 varianter i VOICES.
 */
export const FLASH_VOICE_KEYS = { christian: "christian-flash", ernesto: "ernesto-flash" } as const;

/** Modeller, der understøtter previous_text/next_text (sammenhæng mellem sætninger). */
export function supportsStitching(model: string): boolean {
  return !model.startsWith("eleven_v3");
}

/** Find en stemme ud fra nøglen (faste stemmer, Flash-udgaverne eller Ernestos). */
export async function resolveVoice(key: string | null | undefined): Promise<Voice | null> {
  if (key === ERNESTO_VOICE_KEY) return ernestoVoice();
  if (key === FLASH_VOICE_KEYS.ernesto) {
    // Turbo v2.5: målt 0,34 s til første lyd med hans Professional-stemme og bedre kvalitet end Flash.
    const e = await ernestoVoice();
    return e ? { ...e, key, model: "eleven_turbo_v2_5", audioTags: false } : null;
  }
  if (key === FLASH_VOICE_KEYS.christian) {
    const c = VOICES.find((v) => v.key === "christian-v3c")!;
    return { ...c, key, model: "eleven_flash_v2_5", audioTags: false };
  }
  return VOICES.find((v) => v.key === key) ?? null;
}

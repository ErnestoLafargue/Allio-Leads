/**
 * Stemmer ud over de faste i VOICES: Ernestos egen stemme (ElevenLabs-klon lavet af hans egne salgsopkald).
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

/** Find en stemme ud fra nøglen (faste stemmer eller Ernestos). */
export async function resolveVoice(key: string | null | undefined): Promise<Voice | null> {
  if (key === ERNESTO_VOICE_KEY) return ernestoVoice();
  return VOICES.find((v) => v.key === key) ?? null;
}

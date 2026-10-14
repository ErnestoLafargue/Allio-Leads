import { NextResponse } from "next/server";
import { ERNESTO_VOICE_SETTING_KEY, ernestoVoiceId } from "@/lib/ai-saelger/custom-voices";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/scripts-traening/queries";

export const maxDuration = 120;

/** GET — er Ernestos stemme optaget? */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  return NextResponse.json({ voiceId: await ernestoVoiceId() });
}

/**
 * POST (multipart, felt «lyd», en eller flere filer) — laver Ernestos stemme hos ElevenLabs (Instant Voice
 * Clone) ud fra optagelser i browseren og gemmer voice-id'et. En ny optagelse erstatter den aktive stemme;
 * den gamle bliver liggende hos ElevenLabs.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) return NextResponse.json({ error: "Kun for admin" }, { status: 403 });
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "ELEVENLABS_API_KEY mangler" }, { status: 500 });
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("lyd") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  const seconds = Number(form?.get("sekunder") ?? 0);
  if (!files.length) return NextResponse.json({ error: "Ingen lyd modtaget" }, { status: 400 });
  if (seconds && seconds < 45) return NextResponse.json({ error: "Tal mindst 45 sekunder (gerne 1–2 minutter)" }, { status: 400 });

  const out = new FormData();
  out.append("name", "Ernesto (Allio)");
  out.append("description", "Ernesto Lafargue, Allio. Optaget i Allio Leads til AI-mødebookeren.");
  out.append("remove_background_noise", "true");
  out.append("labels", JSON.stringify({ language: "da", accent: "danish", use_case: "conversational" }));
  for (const f of files) out.append("files", f, f.name || "ernesto.webm");
  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", { method: "POST", headers: { "xi-api-key": apiKey }, body: out });
  const data = (await res.json().catch(() => null)) as { voice_id?: string; detail?: unknown } | null;
  if (!res.ok || !data?.voice_id) {
    console.warn("[stemme]", res.status, JSON.stringify(data));
    return NextResponse.json({ error: `ElevenLabs afviste optagelsen (${res.status})`, detail: data?.detail ?? null }, { status: 502 });
  }
  await prisma.appSetting.upsert({
    where: { key: ERNESTO_VOICE_SETTING_KEY },
    create: { key: ERNESTO_VOICE_SETTING_KEY, value: data.voice_id },
    update: { value: data.voice_id },
  });
  return NextResponse.json({ voiceId: data.voice_id });
}

/**
 * Soniox async-transskribering (REST): upload → transskription → tokens → oprydning.
 * Filen og transskriptionen slettes hos Soniox efter brug; kundedata bliver på VPS'en og i databasen.
 */
const BASE = "https://api.soniox.com/v1";

export const SONIOX_ASYNC_MODEL = "stt-async-v5";
/** Soniox async-pris: $0,10 pr. time lyd (september 2026). */
export const SONIOX_USD_PER_HOUR = 0.1;

export type SonioxToken = {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  speaker?: string | null;
  language?: string | null;
  is_audio_event?: boolean | null;
};

export type SonioxResult = { tokens: SonioxToken[]; audioSeconds: number };

type TranscriptionStatus = {
  id: string;
  status: string;
  audio_duration_ms?: number | null;
  error_message?: string | null;
};

async function sonioxFetch<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Soniox ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function transcribeWithSoniox(params: {
  apiKey: string;
  audio: Buffer;
  filename: string;
  /** Talerskelnen — kun til mono; stereo transskriberes pr. kanal uden. */
  diarize: boolean;
  /** Ord/navne modellen skal genkende (fx "Allio" og sælgerens navn). */
  terms: string[];
  pollMs?: number;
  timeoutMs?: number;
}): Promise<SonioxResult> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(params.audio)], { type: "audio/mpeg" }), params.filename);
  const file = await sonioxFetch<{ id: string }>(params.apiKey, "/files", { method: "POST", body: form });

  let transcriptionId: string | null = null;
  try {
    const created = await sonioxFetch<{ id: string }>(params.apiKey, "/transcriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: SONIOX_ASYNC_MODEL,
        file_id: file.id,
        language_hints: ["da", "en"],
        enable_language_identification: true,
        enable_speaker_diarization: params.diarize,
        context: {
          general: [{ key: "domæne", value: "Telefonsalg: mødebooking hos danske klinikker" }],
          terms: params.terms,
        },
      }),
    });
    transcriptionId = created.id;

    const deadline = Date.now() + (params.timeoutMs ?? 10 * 60 * 1000);
    let status: TranscriptionStatus;
    for (;;) {
      status = await sonioxFetch<TranscriptionStatus>(params.apiKey, `/transcriptions/${transcriptionId}`);
      if (status.status === "completed") break;
      if (status.status === "error") throw new Error(`Soniox: ${status.error_message ?? "ukendt fejl"}`);
      if (Date.now() > deadline) throw new Error("Soniox: transskriptionen blev ikke færdig i tide");
      await sleep(params.pollMs ?? 2000);
    }
    const transcript = await sonioxFetch<{ tokens?: SonioxToken[] }>(
      params.apiKey,
      `/transcriptions/${transcriptionId}/transcript`,
    );
    return { tokens: transcript.tokens ?? [], audioSeconds: (status.audio_duration_ms ?? 0) / 1000 };
  } finally {
    if (transcriptionId) {
      await sonioxFetch(params.apiKey, `/transcriptions/${transcriptionId}`, { method: "DELETE" }).catch(() => {});
    }
    await sonioxFetch(params.apiKey, `/files/${file.id}`, { method: "DELETE" }).catch(() => {});
  }
}

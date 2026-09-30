import { NextResponse } from "next/server";
import { activeScriptResponses } from "@/lib/live-coach/script-responses";
import { getViewer } from "@/lib/scripts-traening/queries";

const SONIOX_TEMP_KEY_URL = "https://api.soniox.com/v1/auth/temporary-api-key";

/**
 * POST /api/live-coach/session
 *
 * Starter en live-coach-session: to kortlivede Soniox-nøgler (sælgerens og kundens lydspor streames
 * direkte fra browseren til Soniox — den rigtige nøgle forlader aldrig serveren) og svarene på
 * indvendinger fra det aktive ugens script.
 */
export async function POST() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const apiKey = process.env.SONIOX_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "SONIOX_API_KEY mangler" }, { status: 500 });

  const createKey = async () => {
    const res = await fetch(SONIOX_TEMP_KEY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        usage_type: "transcribe_websocket",
        expires_in_seconds: 60,
        single_use: true,
        max_session_duration_seconds: 4 * 3600,
        client_reference_id: `live-coach:${viewer.userId}`,
      }),
    });
    if (!res.ok) throw new Error(`Soniox ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { api_key: string }).api_key;
  };

  try {
    const [agentKey, customerKey, responses] = await Promise.all([createKey(), createKey(), activeScriptResponses()]);
    return NextResponse.json({ agentKey, customerKey, responses, agentName: viewer.name });
  } catch (err) {
    console.warn("[live-coach/session]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Kunne ikke starte live-coachen" }, { status: 502 });
  }
}

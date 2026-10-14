import { redirect } from "next/navigation";
import { APPROACHES, VOICES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { ernestoVoice } from "@/lib/ai-saelger/custom-voices";
import { AGENT_MODELS } from "@/lib/ai-saelger/practice/simulate";
import { getViewer } from "@/lib/scripts-traening/queries";
import { AdrianChat } from "./adrian-chat";

const VOICE_LABELS: Record<string, string> = {
  "christian-v3c": "Adrian (Christian, v3 Conversational)",
  "isabella-v3c": "Katrine (Isabella, v3 Conversational)",
  "isabella-v4t": "Katrine (Isabella, v4 Turbo)",
  "ernesto-v3c": "Ernesto (din egen stemme)",
};

export default async function AdrianPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) return <p className="text-sm text-stone-600">Kun for admin.</p>;
  const ernesto = await ernestoVoice();
  return (
    <AdrianChat
      playbooks={(Object.keys(APPROACHES) as ApproachKey[]).filter((k) => APPROACHES[k].file).map((k) => ({ key: k, label: APPROACHES[k].label }))}
      models={Object.entries(AGENT_MODELS)
        .map(([key, m]) => ({ key, label: m.label }))
        .sort((x, y) => Number(y.key === "claude-sonnet-5-5") - Number(x.key === "claude-sonnet-5-5"))}
      voices={[...VOICES, ...(ernesto ? [ernesto] : [])].map((v) => ({ key: v.key, label: VOICE_LABELS[v.key] ?? v.key }))}
    />
  );
}

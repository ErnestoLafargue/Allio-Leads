import { redirect } from "next/navigation";
import { APPROACHES, VOICES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { AGENT_MODELS } from "@/lib/ai-saelger/practice/simulate";
import { getViewer } from "@/lib/scripts-traening/queries";
import { AdrianChat } from "./adrian-chat";

const VOICE_LABELS: Record<string, string> = {
  "christian-v3c": "Adrian (Christian, v3 Conversational)",
  "isabella-v3c": "Katrine (Isabella, v3 Conversational)",
  "isabella-v4t": "Katrine (Isabella, v4 Turbo)",
};

export default async function AdrianPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) return <p className="text-sm text-stone-600">Kun for admin.</p>;
  return (
    <AdrianChat
      playbooks={(Object.keys(APPROACHES) as ApproachKey[]).filter((k) => APPROACHES[k].file).map((k) => ({ key: k, label: APPROACHES[k].label }))}
      models={Object.entries(AGENT_MODELS).map(([key, m]) => ({ key, label: m.label }))}
      voices={VOICES.map((v) => ({ key: v.key, label: VOICE_LABELS[v.key] ?? v.key }))}
    />
  );
}

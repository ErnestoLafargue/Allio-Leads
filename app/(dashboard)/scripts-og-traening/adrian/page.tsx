import { redirect } from "next/navigation";
import { APPROACHES, type ApproachKey } from "@/lib/ai-saelger/agents";
import { PERSONAS } from "@/lib/ai-saelger/practice/personas";
import { AGENT_MODELS } from "@/lib/ai-saelger/practice/simulate";
import { getViewer } from "@/lib/scripts-traening/queries";
import { AdrianChat } from "./adrian-chat";

export default async function AdrianPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) return <p className="text-sm text-stone-600">Kun for admin.</p>;
  return (
    <AdrianChat
      playbooks={(Object.keys(APPROACHES) as ApproachKey[]).filter((k) => APPROACHES[k].file).map((k) => ({ key: k, label: APPROACHES[k].label }))}
      leads={PERSONAS.map((p) => ({ key: p.key, label: `${p.lead.kliniknavn} (${p.lead.by}) · ${p.lead.beslutningstager}`, answers: p.answers }))}
      models={Object.entries(AGENT_MODELS).map(([key, m]) => ({ key, label: m.label }))}
    />
  );
}

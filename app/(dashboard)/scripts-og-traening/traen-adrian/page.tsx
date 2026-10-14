import { redirect } from "next/navigation";
import { ALL_SITUATIONS, situationLabel } from "@/lib/ai-saelger/training";
import { getViewer } from "@/lib/scripts-traening/queries";
import { AdrianTrainer } from "./adrian-trainer";

export default async function TrainAdrianPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isAdmin) return <p className="text-sm text-stone-600">Kun for admin.</p>;
  return <AdrianTrainer situations={ALL_SITUATIONS.map((s) => ({ key: s, label: situationLabel(s) }))} />;
}

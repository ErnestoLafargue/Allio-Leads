import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scripts-traening/queries";
import { PracticeTrainer } from "./practice-trainer";

export default async function PracticePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return <PracticeTrainer />;
}

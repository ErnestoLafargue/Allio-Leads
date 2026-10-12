import { redirect } from "next/navigation";
import { getViewer } from "@/lib/scripts-traening/queries";
import { LiveCoachTest } from "./live-coach-test";

export default async function LiveCoachPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return <LiveCoachTest />;
}

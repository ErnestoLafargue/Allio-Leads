import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FlowZoneClient } from "./_components/flowzone-client";

export default async function FlowZoneRoute() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/kampagner");

  return <FlowZoneClient userId={session.user.id} userName={session.user.name ?? ""} />;
}

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { TicketsWorkspace } from "../_components/tickets-workspace";

export const dynamic = "force-dynamic";

export default async function MineTicketsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const viewer = {
    id: session.user.id,
    role: session.user.role ?? "SELLER",
    name: session.user.name ?? "",
  };

  return <TicketsWorkspace viewer={viewer} mode="mine" />;
}

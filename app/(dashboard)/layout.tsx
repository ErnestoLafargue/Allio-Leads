import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/app/components/app-sidebar";
import { PresenceHeartbeat } from "@/app/components/presence-heartbeat";
import { LiveCoachMain, LiveCoachPanel } from "@/app/components/live-coach-panel";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-full bg-stone-50">
      <PresenceHeartbeat />
      <LiveCoachPanel />
      <AppSidebar
        userName={session.user.name ?? session.user.email ?? ""}
        role={session.user.role}
      />
      <LiveCoachMain>
        <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
      </LiveCoachMain>
    </div>
  );
}

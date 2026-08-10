import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DashboardsAdminList } from "@/app/components/dashboards-admin-list";

export default async function DashboardsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/leads");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Dashboards</h1>
        <p className="mt-1 text-sm text-stone-500">
          Byg TV-venlige dashboards med KPI’er fra scoreboardet. Hvert dashboard får en offentlig
          URL, der kan åbnes uden login.
        </p>
      </div>
      <DashboardsAdminList />
    </div>
  );
}

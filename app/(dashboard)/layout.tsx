import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/app/components/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-full bg-stone-50">
      <AppSidebar
        userName={session.user.name ?? session.user.email ?? ""}
        role={session.user.role}
      />
      <main className="min-h-screen px-4 py-6 lg:pl-[5rem] lg:pr-6">
        <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
      </main>
    </div>
  );
}

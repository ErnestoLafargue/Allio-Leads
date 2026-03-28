import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/app/components/nav-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-full flex flex-col bg-stone-50">
      <NavBar userName={session.user.name ?? session.user.email ?? ""} role={session.user.role} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

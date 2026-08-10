import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DashboardBuilder } from "@/app/components/dashboard-builder";

type Props = { params: Promise<{ id: string }> };

export default async function DashboardEditPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/leads");

  const { id } = await params;
  const exists = await prisma.dashboard.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <DashboardBuilder dashboardId={id} />;
}

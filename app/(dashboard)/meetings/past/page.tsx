import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MeetingsList } from "@/app/(dashboard)/meetings/_components/meetings-list";

export default async function PastMeetingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/meetings/new");

  return <MeetingsList type="past" />;
}

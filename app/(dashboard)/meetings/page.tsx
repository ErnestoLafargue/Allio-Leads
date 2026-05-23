import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function MeetingsIndexPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ADMIN") {
    redirect("/meetings/upcoming");
  }
  redirect("/meetings/new");
}

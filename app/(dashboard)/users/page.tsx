import { redirect } from "next/navigation";

/** Tidligere URL — brug Indstillinger. */
export default function UsersPage() {
  redirect("/indstillinger");
}

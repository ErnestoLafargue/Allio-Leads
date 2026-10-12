"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { UsersAdminPanel } from "@/app/components/users-admin-panel";

export default function IndstillingerPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") {
      router.replace("/leads");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (session?.user.role !== "ADMIN") {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-stone-900">Brugere</h2>
        <p className="mt-1 text-sm text-stone-600">
          Opret, skift mellem administrator og sælger, eller slet brugere (via gear ved kontoen).
        </p>
      </div>
      <UsersAdminPanel />
    </div>
  );
}

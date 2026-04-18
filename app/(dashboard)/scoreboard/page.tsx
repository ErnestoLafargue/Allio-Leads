"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DailyScoreboard } from "@/app/components/daily-scoreboard";

export default function ScoreboardPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading") {
    return <p className="text-stone-500">Henter…</p>;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Scoreboard</h1>
        <p className="text-sm text-stone-500">
          Tal for den valgte kalenderdag — kun ét udfald pr. lead (det senest gemte den dag)
        </p>
      </div>
      <DailyScoreboard />
    </div>
  );
}

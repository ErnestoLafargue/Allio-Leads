"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TelnyxCredentialsAdminPanel } from "@/app/components/telnyx-credentials-admin-panel";

export default function TelnyxAdminPage() {
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
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Telnyx</h1>
        <p className="mt-1 text-sm text-stone-600">
          Opret og administrer Telephony Credentials der bruges til browser-opkald via Telnyx WebRTC.
        </p>
      </div>

      <TelnyxCredentialsAdminPanel />
    </div>
  );
}

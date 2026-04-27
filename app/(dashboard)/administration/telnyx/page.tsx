"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TelnyxCredentialsAdminPanel } from "@/app/components/telnyx-credentials-admin-panel";
import { TelnyxRecordingsBackfillPanel } from "@/app/components/telnyx-recordings-backfill-panel";

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

      <div>
        <h2 className="text-lg font-semibold text-stone-900">Tidligere optagelser</h2>
        <p className="mt-1 text-sm text-stone-600">
          Hent eksisterende optagelser fra Telnyx ind i Allio så de bliver afspilbare under
          «Aktivitet» på det rigtige lead. Lyden gemmes i Vercel Blob og henvises fra Neon
          (LeadActivityEvent.recordingUrl).
        </p>
      </div>

      <TelnyxRecordingsBackfillPanel />
    </div>
  );
}

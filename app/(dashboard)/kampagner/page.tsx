"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type Campaign = {
  id: string;
  name: string;
  fieldConfig: string;
  createdAt: string;
  updatedAt: string;
  systemCampaignType?: string | null;
  _count: { leads: number };
};

/** Fast rækkefølge øverst — matcher API (Aktive kunder → Kommende møder → Genbook møde). */
const PINNED_TOP_TYPES = new Set(["active_customers", "upcoming_meetings", "rebooking"]);

export default function KampagnerPage() {
  const { data: session } = useSession();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isAdmin = session?.user.role === "ADMIN";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const data = await res.json();
      setCampaigns(Array.isArray(data) ? data : []);
    } else {
      setCampaigns([]);
      const j = await res.json().catch(() => ({}));
      const msg =
        typeof j.error === "string"
          ? j.error
          : res.status === 401
            ? "Du skal være logget ind."
            : "Kunne ikke hente kampagner.";
      setLoadError(msg);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Kampagner</h1>
        <p className="mt-1 text-sm text-stone-600">
          <strong>Kampagnenavn</strong> åbner arbejdssiden: ét lead ad gangen, udfald øverst, kundedata til venstre,
          noter til højre, <strong>Næste</strong> gemmer og går videre i køen. Under{" "}
          <Link href="/leads" className="font-medium text-stone-800 underline-offset-2 hover:underline">
            Leads
          </Link>{" "}
          ser du alle leads på tværs af kampagner. Som administrator: kolonnen{" "}
          <strong>Kampagne-layout</strong> er til felter — ikke den daglige opkaldsside. Nye kampagner under{" "}
          <Link href="/import" className="font-medium text-stone-800 underline-offset-2 hover:underline">
            Opret &amp; Import
          </Link>
          .
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-medium">{loadError}</p>
          <p className="mt-2 text-amber-900/90">
            Hvis du lige har opdateret koden: kør{" "}
            <code className="rounded bg-amber-100/80 px-1.5 py-0.5 font-mono text-xs">
              npx prisma migrate deploy
            </code>{" "}
            i projektmappen og genstart udviklingsserveren — så matcher databasen igen, og kampagnerne vises.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Navn</th>
              <th className="px-4 py-3 font-medium">Leads</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Admin</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-4 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 3 : 2} className="px-4 py-8 text-center text-stone-500">
                  Ingen kampagner endnu.{" "}
                  {isAdmin ? (
                    <>
                      Opret en under{" "}
                      <Link href="/import" className="font-medium underline-offset-2 hover:underline">
                        Opret &amp; Import
                      </Link>
                      .
                    </>
                  ) : (
                    "Kontakt en administrator."
                  )}
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr
                  key={c.id}
                  className={
                    PINNED_TOP_TYPES.has(String(c.systemCampaignType ?? "").trim())
                      ? "border-b border-stone-100 bg-stone-50/90 hover:bg-stone-100/90"
                      : "hover:bg-stone-50/80"
                  }
                >
                  <td className="px-4 py-3 font-medium text-stone-900">
                    <Link
                      href={`/kampagner/${c.id}/arbejd`}
                      className="text-stone-900 underline-offset-2 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{c._count.leads}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <Link
                        href={`/kampagner/${c.id}`}
                        className="text-sm font-medium text-stone-700 underline-offset-2 hover:underline"
                      >
                        Kampagne-layout
                      </Link>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

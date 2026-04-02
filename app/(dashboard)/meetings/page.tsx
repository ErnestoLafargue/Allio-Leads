"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { StandaloneMeetingBooker } from "@/app/components/booking/standalone-meeting-booker";
import {
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";

type Meeting = {
  id: string;
  companyName: string;
  phone: string;
  meetingBookedAt: string | null;
  meetingScheduledFor: string | null;
  meetingOutcomeStatus?: string;
  bookedByUser: { id: string; name: string; username: string } | null;
  campaign?: { id: string; name: string };
};

function outcomeLabel(raw?: string) {
  const k = String(raw ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING;
  return MEETING_OUTCOME_LABELS[k] ?? MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING];
}

export default function MeetingsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const role = session?.user?.role ?? "";
  const userId = session?.user?.id ?? "";
  const isAdmin = role === "ADMIN";

  const [rows, setRows] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/meetings");
    if (!res.ok) {
      setError("Kunne ikke hente møder");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as Meeting[];
    setRows(data);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchOutcome(
    id: string,
    meetingOutcomeStatus: "PENDING" | "HELD" | "CANCELLED" | typeof MEETING_OUTCOME_SALE,
  ) {
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingOutcomeStatus }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke opdatere udfald");
      return;
    }
    await load();
  }

  function canOpen(m: Meeting) {
    return isAdmin || m.bookedByUser?.id === userId;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Møder</h1>
        <p className="mt-1 text-sm text-stone-600">
          Alle kan se oversigt over bookede møder (tid, booket af og status). Kun{" "}
          <strong>administratorer</strong> og <strong>sælgeren der har booket</strong> kan åbne leadet og læse eller
          redigere noter.           Administratorer registrerer mødeudfald (afventende, afholdt, annulleret, salg) — det styrer bl.a. kø og
          provision pr. dag.
        </p>
      </div>

      <StandaloneMeetingBooker onBooked={() => void load()} />

      {sessionStatus === "loading" && (
        <p className="text-sm text-stone-500">Henter session…</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
            <tr>
              <th className="px-4 py-3 font-medium">Virksomhed</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Kampagne</th>
              <th className="px-4 py-3 font-medium">Møde tid</th>
              <th className="px-4 py-3 font-medium">Booket</th>
              <th className="px-4 py-3 font-medium">Sælger</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {isAdmin && <th className="px-4 py-3 font-medium">Admin</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-stone-500">
                  Henter…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-stone-500">
                  Ingen bookede møder endnu.
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="hover:bg-stone-50/80">
                  <td className="px-4 py-3">
                    {canOpen(m) ? (
                      <Link
                        href={`/leads/${m.id}`}
                        className="font-medium text-stone-900 underline-offset-2 hover:underline"
                      >
                        {m.companyName}
                      </Link>
                    ) : (
                      <span
                        className="font-medium text-stone-700"
                        title="Kun bookeren eller administrator kan åbne mødet med noter"
                      >
                        {m.companyName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-700">{m.phone}</td>
                  <td className="hidden px-4 py-3 text-stone-600 md:table-cell">
                    {m.campaign?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-800">
                    {m.meetingScheduledFor
                      ? new Date(m.meetingScheduledFor).toLocaleString("da-DK")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {m.meetingBookedAt ? new Date(m.meetingBookedAt).toLocaleString("da-DK") : "—"}
                  </td>
                  <td className="px-4 py-3 text-stone-700">
                    {m.bookedByUser ? `${m.bookedByUser.name}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        String(m.meetingOutcomeStatus).toUpperCase() === "HELD"
                          ? "bg-emerald-100 text-emerald-900"
                          : String(m.meetingOutcomeStatus).toUpperCase() === "CANCELLED"
                            ? "bg-red-100 text-red-900"
                            : String(m.meetingOutcomeStatus).toUpperCase() === MEETING_OUTCOME_SALE
                              ? "bg-violet-100 text-violet-950"
                              : "bg-amber-100 text-amber-950"
                      }`}
                    >
                      {outcomeLabel(m.meetingOutcomeStatus)}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex max-w-[14rem] flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => void patchOutcome(m.id, "PENDING")}
                          className="rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Afventende
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchOutcome(m.id, "HELD")}
                          className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-800"
                        >
                          Afholdt
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchOutcome(m.id, "CANCELLED")}
                          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-800 hover:bg-stone-50"
                        >
                          Annulleret
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchOutcome(m.id, MEETING_OUTCOME_SALE)}
                          className="rounded-md bg-violet-700 px-2 py-1 text-xs font-medium text-white hover:bg-violet-800"
                        >
                          Salg
                        </button>
                      </div>
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

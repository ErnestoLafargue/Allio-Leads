"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { BookingPanel, type BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { MeetingContactFields } from "@/app/components/booking/meeting-contact-fields";

type Props = {
  className?: string;
  /** Kaldt efter vellykket oprettelse (lead returneres fra API). */
  onBooked?: (leadId: string) => void;
};

export function StandaloneMeetingBooker({ className = "", onBooked }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const [notes, setNotes] = useState("");
  const [meetingContactName, setMeetingContactName] = useState("");
  const [meetingContactEmail, setMeetingContactEmail] = useState("");
  const [meetingContactPhonePrivate, setMeetingContactPhonePrivate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirmBooking(detail: BookingConfirmPayload) {
    setError(null);
    const cn = meetingContactName.trim();
    const ce = meetingContactEmail.trim();
    const cp = meetingContactPhonePrivate.trim();
    if (!cn || !ce || !cp) {
      setError("Udfyld navn, e-mail og privat telefon til mødekontakten.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) {
      setError("Ugyldig e-mail til mødekontakten.");
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/meetings/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes,
        meetingContactName: cn,
        meetingContactEmail: ce,
        meetingContactPhonePrivate: cp,
        meetingScheduledFor: detail.localDateTimeISO,
        ...(detail.adminSkipBookingOverlap ? { adminSkipBookingOverlap: true } : {}),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke oprette mødet.");
      return;
    }
    const lead = (await res.json()) as { id: string };
    onBooked?.(lead.id);
    router.push(`/leads/${lead.id}`);
    router.refresh();
  }

  return (
    <section
      className={[
        "space-y-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6",
        className,
      ].join(" ")}
    >
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Book nyt møde</h2>
        <p className="mt-1 text-sm text-stone-500">
          Opretter et lead under «Kommende møder» med status møde booket. Udfyld mødekontakt, evt. noter og vælg tid.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <MeetingContactFields
        contactRequired
        meetingContactName={meetingContactName}
        meetingContactEmail={meetingContactEmail}
        meetingContactPhonePrivate={meetingContactPhonePrivate}
        onMeetingContactName={setMeetingContactName}
        onMeetingContactEmail={setMeetingContactEmail}
        onMeetingContactPhonePrivate={setMeetingContactPhonePrivate}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-700">Noter (valgfri)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2"
          placeholder="Evt. bemærkninger til mødet…"
        />
      </div>

      <BookingPanel
        allowMeetingConfirm
        allowAdminAvailabilityOverride={isAdmin}
        isSubmitting={submitting}
        onConfirmBooking={(d) => void onConfirmBooking(d)}
      />
    </section>
  );
}

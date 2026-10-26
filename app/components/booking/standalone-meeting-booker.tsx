"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { BookingPanel, type BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { MeetingContactFields } from "@/app/components/booking/meeting-contact-fields";
import { buildLeadDetailHref, KNOWN_LEAD_SOURCES } from "@/lib/lead-navigation";
import { isMeetingNotesSufficient } from "@/lib/meeting-notes-quality";
import { MeetingNotesRequiredDialog } from "@/app/components/meeting-notes-required-dialog";
import {
  MEETING_TYPE_ONLINE,
  type MeetingType,
} from "@/lib/meeting-type";
import { validateMeetingContactFields } from "@/lib/meeting-contact-validation";

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
  const [meetingCompanyName, setMeetingCompanyName] = useState("");
  const [meetingContactName, setMeetingContactName] = useState("");
  const [meetingContactEmail, setMeetingContactEmail] = useState("");
  const [meetingContactPhonePrivate, setMeetingContactPhonePrivate] = useState("");
  const [meetingType, setMeetingType] = useState<MeetingType>(MEETING_TYPE_ONLINE);
  const [meetingAddress, setMeetingAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesRequiredOpen, setNotesRequiredOpen] = useState(false);
  const [calendarUserId, setCalendarUserId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { defaultUserId: string | null };
      if (!cancelled) setCalendarUserId(data.defaultUserId ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onConfirmBooking(detail: BookingConfirmPayload) {
    setError(null);
    const company = meetingCompanyName.trim();
    const cn = meetingContactName.trim();
    const ce = meetingContactEmail.trim();
    const cp = meetingContactPhonePrivate.trim();
    const type = detail.meetingType ?? meetingType;
    const contactErr = validateMeetingContactFields(cn, ce, cp, company, {
      meetingType: type,
      meetingAddress,
    });
    if (contactErr) {
      setError(
        contactErr.address ??
          contactErr.meetingCompany ??
          "Udfyld navn, e-mail og privat telefon til mødekontakten.",
      );
      return;
    }
    if (!isMeetingNotesSufficient(notes)) {
      setNotesRequiredOpen(true);
      return;
    }

    setSubmitting(true);
    setMeetingType(type);
    const res = await fetch("/api/meetings/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes,
        meetingCompanyName: company,
        meetingContactName: cn,
        meetingContactEmail: ce,
        meetingContactPhonePrivate: cp,
        meetingType: type,
        meetingAddress: meetingAddress.trim(),
        meetingScheduledFor: detail.localDateTimeISO,
        ...(detail.adminSkipBookingOverlap ? { adminSkipBookingOverlap: true } : {}),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j?.code === "MEETING_NOTES_INSUFFICIENT") {
        setNotesRequiredOpen(true);
        return;
      }
      setError(typeof j.error === "string" ? j.error : "Kunne ikke oprette mødet.");
      return;
    }
    const lead = (await res.json()) as { id: string };
    onBooked?.(lead.id);
    router.push(buildLeadDetailHref(lead.id, KNOWN_LEAD_SOURCES.meetingsNew));
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
          Opretter et lead under «Kommende møder» med status møde booket. Udfyld mødekontakt, noter og vælg tid.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <MeetingContactFields
        contactRequired
        meetingCompanyName={meetingCompanyName}
        onMeetingCompanyName={setMeetingCompanyName}
        meetingContactName={meetingContactName}
        meetingContactEmail={meetingContactEmail}
        meetingContactPhonePrivate={meetingContactPhonePrivate}
        onMeetingContactName={setMeetingContactName}
        onMeetingContactEmail={setMeetingContactEmail}
        onMeetingContactPhonePrivate={setMeetingContactPhonePrivate}
        meetingType={meetingType}
        meetingAddress={meetingAddress}
        onMeetingAddress={setMeetingAddress}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-700">Noter (påkrævet)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50/60 px-3 py-2 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2"
          placeholder="Hvad blev aftalt, og hvad fandt kunden interessant?"
        />
      </div>

      <BookingPanel
        calendarUserId={calendarUserId}
        meetingType={meetingType}
        onMeetingTypeChange={setMeetingType}
        allowMeetingConfirm
        allowAdminAvailabilityOverride={isAdmin}
        isSubmitting={submitting}
        onConfirmBooking={(d) => void onConfirmBooking(d)}
      />
      <MeetingNotesRequiredDialog
        open={notesRequiredOpen}
        onClose={() => setNotesRequiredOpen(false)}
      />
    </section>
  );
}

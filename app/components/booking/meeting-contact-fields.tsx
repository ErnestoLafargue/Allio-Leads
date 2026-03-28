"use client";

import type { MeetingContactFieldErrors } from "@/lib/meeting-contact-validation";

export type MeetingContactFieldsProps = {
  meetingContactName: string;
  meetingContactEmail: string;
  meetingContactPhonePrivate: string;
  onMeetingContactName: (v: string) => void;
  onMeetingContactEmail: (v: string) => void;
  onMeetingContactPhonePrivate: (v: string) => void;
  className?: string;
  /** Når true: felterne er obligatoriske (HTML + visuelle markeringer ved fejl). */
  contactRequired?: boolean;
  fieldErrors?: MeetingContactFieldErrors;
};

function inputRingClass(err?: string) {
  return err
    ? "border-red-300 ring-red-400 focus:ring-2"
    : "border-emerald-200 ring-emerald-400 focus:ring-2";
}

export function MeetingContactFields({
  meetingContactName,
  meetingContactEmail,
  meetingContactPhonePrivate,
  onMeetingContactName,
  onMeetingContactEmail,
  onMeetingContactPhonePrivate,
  className = "",
  contactRequired = false,
  fieldErrors,
}: MeetingContactFieldsProps) {
  const e = fieldErrors ?? {};
  return (
    <div
      className={[
        "w-full space-y-3 rounded-xl border border-emerald-200/90 bg-emerald-50/45 p-4",
        className,
      ].join(" ")}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">Mødekontakt</p>
        {contactRequired ? (
          <p className="mt-0.5 text-xs text-emerald-800/80">
            Påkrævet ved møde booket. Personen der deltager — brug <strong>privat</strong> telefon, ikke
            virksomhedens nummer.
          </p>
        ) : null}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-emerald-950">Navn på person til mødet</label>
        <input
          type="text"
          autoComplete="name"
          value={meetingContactName}
          onChange={(e) => onMeetingContactName(e.target.value)}
          aria-invalid={Boolean(e.name)}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ${inputRingClass(e.name)}`}
          placeholder="Fx Jesper Hansen"
          required={contactRequired}
        />
        {e.name ? <p className="mt-1 text-xs text-red-600">{e.name}</p> : null}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-emerald-950">Personens e-mail</label>
        <input
          type="email"
          autoComplete="email"
          value={meetingContactEmail}
          onChange={(e) => onMeetingContactEmail(e.target.value)}
          aria-invalid={Boolean(e.email)}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ${inputRingClass(e.email)}`}
          placeholder="person@eksempel.dk"
          required={contactRequired}
        />
        {e.email ? <p className="mt-1 text-xs text-red-600">{e.email}</p> : null}
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-emerald-950">
          Privat telefonnummer (ikke virksomhedsnummer)
        </label>
        <input
          type="tel"
          autoComplete="tel"
          value={meetingContactPhonePrivate}
          onChange={(e) => onMeetingContactPhonePrivate(e.target.value)}
          aria-invalid={Boolean(e.phone)}
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ${inputRingClass(e.phone)}`}
          placeholder="Fx 12 34 56 78"
          required={contactRequired}
        />
        {e.phone ? <p className="mt-1 text-xs text-red-600">{e.phone}</p> : null}
      </div>
    </div>
  );
}

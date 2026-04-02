"use client";

import { LeadDataLeftPanel } from "@/app/components/lead-data-left-panel";
import { BookingPanel, type BookingPanelProps } from "@/app/components/booking/booking-panel";
import { MeetingContactFields } from "@/app/components/booking/meeting-contact-fields";
import { AdLibraryCard } from "@/app/components/ad-library-card";
import type { MeetingContactFieldErrors } from "@/lib/meeting-contact-validation";

type MeetingContactProps = {
  meetingContactName: string;
  meetingContactEmail: string;
  meetingContactPhonePrivate: string;
  onMeetingContactName: (v: string) => void;
  onMeetingContactEmail: (v: string) => void;
  onMeetingContactPhonePrivate: (v: string) => void;
  contactRequired: boolean;
  meetingContactErrors?: MeetingContactFieldErrors;
};

export type LeadKundeNoterBookingProps = {
  /** Skifter ved lead-skift så scroll/højder nulstilles pænt */
  gridKey: string;
  fieldConfigJson: string;
  companyName: string;
  onCompanyName: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  email: string;
  onEmail: (v: string) => void;
  cvr: string;
  onCvr: (v: string) => void;
  address: string;
  onAddress: (v: string) => void;
  postalCode: string;
  onPostalCode: (v: string) => void;
  city: string;
  onCity: (v: string) => void;
  industry: string;
  onIndustry: (v: string) => void;
  custom: Record<string, string>;
  onCustom: (key: string, value: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  meetingContact: MeetingContactProps;
  booking: BookingPanelProps;
  /** Valgfri bund-linje (fx ekstra «Gem og næste» i kampagne) */
  bottomBar?: React.ReactNode;
  /** Ekstra klasse på ydre grid-wrapper (kampagne bruger flex-1 + min-h) */
  gridClassName?: string;
};

/**
 * Kunde | Noter + mødekontakt + booking — samme struktur som kampagne-arbejdsfladen.
 */
export function LeadKundeNoterBooking({
  gridKey,
  fieldConfigJson,
  companyName,
  onCompanyName,
  phone,
  onPhone,
  email,
  onEmail,
  cvr,
  onCvr,
  address,
  onAddress,
  postalCode,
  onPostalCode,
  city,
  onCity,
  industry,
  onIndustry,
  custom,
  onCustom,
  notes,
  onNotesChange,
  meetingContact,
  booking,
  bottomBar,
  gridClassName = "",
}: LeadKundeNoterBookingProps) {
  const {
    meetingContactName,
    meetingContactEmail,
    meetingContactPhonePrivate,
    onMeetingContactName,
    onMeetingContactEmail,
    onMeetingContactPhonePrivate,
    contactRequired,
    meetingContactErrors,
  } = meetingContact;

  return (
    <>
      <div
        key={gridKey}
        className={[
          "grid min-h-0 grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg lg:grid-cols-2 lg:min-h-[calc(100dvh-15rem)]",
          gridClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex min-h-[42dvh] min-w-0 flex-col border-b border-stone-100 p-4 sm:p-6 lg:min-h-full lg:border-b-0 lg:border-r lg:border-stone-100">
          <h2 className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">Kunde</h2>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <LeadDataLeftPanel
              fieldConfigJson={fieldConfigJson}
              companyName={companyName}
              onCompanyName={onCompanyName}
              phone={phone}
              onPhone={onPhone}
              email={email}
              onEmail={onEmail}
              cvr={cvr}
              onCvr={onCvr}
              address={address}
              onAddress={onAddress}
              postalCode={postalCode}
              onPostalCode={onPostalCode}
              city={city}
              onCity={onCity}
              industry={industry}
              onIndustry={onIndustry}
              custom={custom}
              onCustom={onCustom}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-stretch p-4 sm:p-6 lg:h-full lg:items-start">
          <h2 className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">Noter</h2>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="min-h-[4.5rem] h-48 w-full max-w-full resize-y rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2"
            placeholder="Skriv noter… Træk i nederste kant for kortere eller længere."
            rows={6}
          />
          <MeetingContactFields
            className="mt-4 shrink-0"
            contactRequired={contactRequired}
            fieldErrors={contactRequired ? meetingContactErrors : undefined}
            meetingContactName={meetingContactName}
            meetingContactEmail={meetingContactEmail}
            meetingContactPhonePrivate={meetingContactPhonePrivate}
            onMeetingContactName={onMeetingContactName}
            onMeetingContactEmail={onMeetingContactEmail}
            onMeetingContactPhonePrivate={onMeetingContactPhonePrivate}
          />
          <AdLibraryCard companyName={companyName} className="mt-4 shrink-0" />
        </div>
      </div>

      <BookingPanel {...booking} />

      {bottomBar ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-stone-200 pt-4">
          {bottomBar}
        </div>
      ) : null}
    </>
  );
}

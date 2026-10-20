"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingCalendar } from "@/app/components/booking/booking-calendar";
import { BookingTimeSlots } from "@/app/components/booking/booking-time-slots";
import type { CopenhagenBookingSlotWithAvailability } from "@/lib/booking/availability";
import {
  meetingDurationMinutes,
  transportBufferMinutes,
} from "@/lib/booking/meeting-type-buffers";
import { startOfLocalDay, toCopenhagenDateKey } from "@/lib/booking/mock-availability";
import {
  MEETING_TYPE_ONLINE,
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  meetingTypeLabel,
  normalizeMeetingType,
} from "@/lib/meeting-type";

export type BookingConfirmPayload = {
  dateKey: string;
  /** ISO 8601 for valgt tidspunkt (UTC) */
  localDateTimeISO: string;
  time: string;
  campaignId?: string;
  leadId?: string;
  meetingType: MeetingType;
  /**
   * Kun administrator: spring overlap-tjek over (mødeblok-minutter før/efter). Det nye møde får stadig sin egen blok i systemet.
   */
  adminSkipBookingOverlap?: boolean;
};

export type BookingPanelProps = {
  campaignId?: string;
  leadId?: string;
  /** Mødeansvarlig hvis kalender — styrer manuelle blokeringer i tilgængelighed. */
  calendarUserId?: string;
  initialMeetingLocal?: string;
  meetingType?: MeetingType | string;
  onMeetingTypeChange?: (type: MeetingType) => void;
  onConfirmBooking?: (detail: BookingConfirmPayload) => void | Promise<void>;
  isSubmitting?: boolean;
  allowMeetingConfirm?: boolean;
  /** Administrator: vis «Overskrid» og tillad valg af optagne tider */
  allowAdminAvailabilityOverride?: boolean;
  className?: string;
};

export function BookingPanel({
  campaignId,
  leadId,
  calendarUserId: calendarUserIdProp,
  initialMeetingLocal,
  meetingType: meetingTypeProp,
  onMeetingTypeChange,
  onConfirmBooking,
  isSubmitting = false,
  allowMeetingConfirm = true,
  allowAdminAvailabilityOverride = false,
  className = "",
}: BookingPanelProps) {
  const [monthAnchor, setMonthAnchor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CopenhagenBookingSlotWithAvailability | null>(null);
  const [slotOptions, setSlotOptions] = useState<CopenhagenBookingSlotWithAvailability[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [adminAvailabilityOverride, setAdminAvailabilityOverride] = useState(false);
  const [resolvedCalendarUserId, setResolvedCalendarUserId] = useState<string | undefined>(
    calendarUserIdProp,
  );
  const [internalMeetingType, setInternalMeetingType] = useState<MeetingType>(() =>
    normalizeMeetingType(meetingTypeProp),
  );
  const meetingType =
    meetingTypeProp !== undefined ? normalizeMeetingType(meetingTypeProp) : internalMeetingType;
  const durationMin = meetingDurationMinutes(meetingType);
  const transportMin = transportBufferMinutes(meetingType);

  function setMeetingType(next: MeetingType) {
    if (next === meetingType) return;
    setSelectedSlot(null);
    if (meetingTypeProp === undefined) setInternalMeetingType(next);
    onMeetingTypeChange?.(next);
  }

  useEffect(() => {
    if (calendarUserIdProp) {
      setResolvedCalendarUserId(calendarUserIdProp);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { defaultUserId: string | null };
      if (!cancelled) setResolvedCalendarUserId(data.defaultUserId ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [calendarUserIdProp]);

  useEffect(() => {
    if (!initialMeetingLocal?.trim()) {
      setSelectedDate(null);
      setSelectedSlot(null);
      return;
    }
    const d = new Date(initialMeetingLocal);
    if (Number.isNaN(d.getTime())) {
      setSelectedDate(null);
      setSelectedSlot(null);
      return;
    }
    setSelectedDate(startOfLocalDay(d));
    setSelectedSlot(null);
  }, [leadId, initialMeetingLocal]);

  useEffect(() => {
    if (!allowAdminAvailabilityOverride && adminAvailabilityOverride) {
      setAdminAvailabilityOverride(false);
    }
  }, [allowAdminAvailabilityOverride, adminAvailabilityOverride]);

  useEffect(() => {
    if (!selectedDate) {
      setSlotOptions([]);
      return;
    }
    const dayKey = toCopenhagenDateKey(selectedDate);
    const calendarUserId = resolvedCalendarUserId;
    if (!calendarUserId) {
      setSlotOptions([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    void (async () => {
      const qs = new URLSearchParams({
        date: dayKey,
        userId: calendarUserId,
        meetingType,
      });
      if (leadId) qs.set("excludeLeadId", leadId);
      const res = await fetch(`/api/booking/availability?${qs}`);
      let allSlots: CopenhagenBookingSlotWithAvailability[] = [];
      if (res.ok) {
        const payload = (await res.json()) as {
          slots?: CopenhagenBookingSlotWithAvailability[];
        };
        allSlots = Array.isArray(payload.slots) ? payload.slots : [];
      }
      const display =
        allowAdminAvailabilityOverride && adminAvailabilityOverride
          ? allSlots
          : allSlots.filter((s) => s.available);
      if (!cancelled) {
        setSlotOptions(display);
        setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedDate,
    leadId,
    resolvedCalendarUserId,
    allowAdminAvailabilityOverride,
    adminAvailabilityOverride,
    meetingType,
  ]);

  useEffect(() => {
    if (
      !adminAvailabilityOverride &&
      selectedSlot &&
      !selectedSlot.available &&
      allowAdminAvailabilityOverride
    ) {
      setSelectedSlot(null);
    }
  }, [adminAvailabilityOverride, selectedSlot, allowAdminAvailabilityOverride]);

  useEffect(() => {
    if (!initialMeetingLocal?.trim() || slotOptions.length === 0 || !selectedDate) return;
    const wantMs = new Date(initialMeetingLocal).getTime();
    if (Number.isNaN(wantMs)) return;
    const match = slotOptions.find((s) => Math.abs(s.utcMs - wantMs) < 90_000);
    if (match) setSelectedSlot(match);
  }, [initialMeetingLocal, slotOptions, selectedDate, leadId]);

  useEffect(() => {
    if (!selectedSlot) return;
    if (!slotOptions.some((s) => s.utcMs === selectedSlot.utcMs)) {
      setSelectedSlot(null);
    }
  }, [slotOptions, selectedSlot]);

  const slotEntries = useMemo(
    () =>
      slotOptions.map((s) => ({
        time: s.time,
        busy: allowAdminAvailabilityOverride && adminAvailabilityOverride && !s.available,
      })),
    [slotOptions, allowAdminAvailabilityOverride, adminAvailabilityOverride],
  );

  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat("da-DK", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(selectedDate)
    : "Vælg en dato";

  const onSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
    setSelectedSlot(null);
  }, []);

  const tzLabel = useMemo(() => {
    const tz = "Europe/Copenhagen";
    const now = new Date();
    const name =
      new Intl.DateTimeFormat("da-DK", { timeZone: tz, timeZoneName: "long" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? tz;
    const time = now.toLocaleTimeString("da-DK", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${name} (${time})`;
  }, []);

  async function handleConfirm() {
    if (!selectedDate || !selectedSlot || isSubmitting) return;

    const dayKey = toCopenhagenDateKey(selectedDate);
    const adminSkipBookingOverlap = Boolean(
      allowAdminAvailabilityOverride &&
        adminAvailabilityOverride &&
        selectedSlot &&
        !selectedSlot.available,
    );
    const payload: BookingConfirmPayload = {
      dateKey: dayKey,
      time: selectedSlot.time,
      localDateTimeISO: new Date(selectedSlot.utcMs).toISOString(),
      campaignId,
      leadId,
      meetingType,
      ...(adminSkipBookingOverlap ? { adminSkipBookingOverlap: true } : {}),
    };

    await onConfirmBooking?.(payload);
  }

  const canConfirm = Boolean(
    selectedDate && selectedSlot && !isSubmitting && !slotsLoading && allowMeetingConfirm,
  );

  return (
    <section
      className={[
        "rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)] sm:p-6",
        className,
      ].join(" ")}
    >
      <h2 className="mb-4 text-lg font-semibold tracking-tight text-slate-900">Vælg tid til møde</h2>

      {/* Mødetype først — ledige tider afhænger af Online (60 min) vs Fysisk (90 + transport). */}
      <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-900/80">
          1. Mødetype
        </p>
        <p className="mb-3 text-xs text-slate-600">
          Vælg type først — ledige tider nedenfor opdateres automatisk.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {(
            [
              [MEETING_TYPE_ONLINE, meetingTypeLabel(MEETING_TYPE_ONLINE)],
              [MEETING_TYPE_PHYSICAL, meetingTypeLabel(MEETING_TYPE_PHYSICAL)],
            ] as const
          ).map(([value, label]) => {
            const active = meetingType === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setMeetingType(value)}
                className={[
                  "flex-1 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                  active
                    ? "border-blue-600 bg-blue-600 text-white ring-2 ring-blue-300/70"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-600">
          {meetingType === MEETING_TYPE_PHYSICAL ? (
            <>
              Fysisk: <strong>{durationMin} min</strong> +{" "}
              <strong>{transportMin} min transport</strong> før og efter. Udfyld mødeadresse i det
              grønne felt. Podio + Allio-Native (uden Cal.eu).
            </>
          ) : (
            <>
              Online: <strong>{durationMin} min</strong>. Cal.eu sender invitation/Meet-link. Podio +
              Allio-Native.
            </>
          )}
          {!adminAvailabilityOverride || !allowAdminAvailabilityOverride
            ? " Optagne tider er skjult."
            : null}
        </p>
      </div>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        2. Dato og tid
      </p>
      <p className="mb-4 flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <span className="text-sm" aria-hidden>
          🌐
        </span>
        <span>Tidszone:</span>
        <span className="font-medium text-blue-700">{tzLabel}</span>
      </p>

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <BookingCalendar
          monthAnchor={monthAnchor}
          onMonthChange={(d) => {
            setMonthAnchor(startOfLocalDay(d));
          }}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
        />

        <BookingTimeSlots
          slots={slotEntries}
          selectedTime={selectedSlot?.time ?? null}
          onSelectTime={(time) => {
            const s = slotOptions.find((x) => x.time === time) ?? null;
            setSelectedSlot(s);
          }}
          dateLabel={dateLabel}
          loading={slotsLoading}
          allowSelectBusySlots={allowAdminAvailabilityOverride && adminAvailabilityOverride}
        />
      </div>

      {allowAdminAvailabilityOverride ? (
        <div className="mt-6">
          <button
            type="button"
            aria-pressed={adminAvailabilityOverride}
            onClick={() => setAdminAvailabilityOverride((v) => !v)}
            className={[
              "w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold shadow-sm transition sm:text-sm",
              adminAvailabilityOverride
                ? "border-amber-600 bg-amber-100 text-amber-950 ring-2 ring-amber-400/60"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            Overskrid
            <span className="mt-0.5 block font-normal text-slate-600">
              Vis alle tider inkl. optagne — book alligevel som admin (varighed/transport gælder stadig for det nye møde).
            </span>
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col items-stretch gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
        {!allowMeetingConfirm ? (
          <p className="order-2 text-center text-xs text-slate-500 sm:order-1 sm:mr-auto sm:text-left">
            Vælg udfaldet <strong>Møde booket</strong> for at gemme tidspunktet på leadet.
          </p>
        ) : null}
        <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row sm:gap-3">
          <a
            href="https://calendly.com/victor-allio/onboarding"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            Calendly
          </a>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => void handleConfirm()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Gemmer…" : "Bekræft booking"}
          </button>
        </div>
      </div>
    </section>
  );
}

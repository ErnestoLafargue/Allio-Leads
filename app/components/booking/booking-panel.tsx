"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookingCalendar } from "@/app/components/booking/booking-calendar";
import { BookingTimeSlots } from "@/app/components/booking/booking-time-slots";
import {
  getCopenhagenBookingSlotsWithAvailability,
  parseOccupiedBlocksFromApi,
  type CopenhagenBookingSlotWithAvailability,
} from "@/lib/booking/availability";
import { startOfLocalDay, toCopenhagenDateKey } from "@/lib/booking/mock-availability";

export type BookingConfirmPayload = {
  dateKey: string;
  /** ISO 8601 for valgt tidspunkt (UTC) */
  localDateTimeISO: string;
  time: string;
  campaignId?: string;
  leadId?: string;
  /**
   * Kun administrator: spring overlap-tjek over (75 min før/efter). Det nye møde får stadig sin egen blok i systemet.
   */
  adminSkipBookingOverlap?: boolean;
};

export type BookingPanelProps = {
  campaignId?: string;
  leadId?: string;
  initialMeetingLocal?: string;
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
  initialMeetingLocal,
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
    let cancelled = false;
    setSlotsLoading(true);
    void (async () => {
      const qs = new URLSearchParams({ date: dayKey });
      if (leadId) qs.set("excludeLeadId", leadId);
      const res = await fetch(`/api/booking/availability?${qs}`);
      const occupied = res.ok
        ? parseOccupiedBlocksFromApi((await res.json()).blocks as { start: string; end: string }[])
        : [];
      const allSlots = getCopenhagenBookingSlotsWithAvailability(dayKey, occupied);
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
  }, [selectedDate, leadId, allowAdminAvailabilityOverride, adminAvailabilityOverride]);

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
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Vælg tid til møde</h2>
          {allowAdminAvailabilityOverride ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                aria-pressed={adminAvailabilityOverride}
                onClick={() => setAdminAvailabilityOverride((v) => !v)}
                className={[
                  "rounded-lg border px-3 py-2 text-left text-xs font-semibold shadow-sm transition sm:text-sm",
                  adminAvailabilityOverride
                    ? "border-amber-600 bg-amber-100 text-amber-950 ring-2 ring-amber-400/60"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                Overskrid
                <span className="mt-0.5 block font-normal text-slate-600">
                  Vis alle tider inkl. optagne — book alligevel som admin (75 min blokering gælder stadig for det nye møde).
                </span>
              </button>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-slate-600 sm:max-w-sm">
          Hvert møde reserverer <strong>75 min før</strong> og <strong>75 min efter</strong> start (gitter 15 min).
          {!adminAvailabilityOverride || !allowAdminAvailabilityOverride
            ? " Ledige tider er filtreret."
            : null}
        </p>
      </div>

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

      <div className="mt-6 flex flex-col items-stretch gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-end">
        {!allowMeetingConfirm ? (
          <p className="order-2 text-center text-xs text-slate-500 sm:order-1 sm:mr-auto sm:text-left">
            Vælg udfaldet <strong>Møde booket</strong> for at gemme tidspunktet på leadet.
          </p>
        ) : null}
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => void handleConfirm()}
          className="order-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:order-2"
        >
          {isSubmitting ? "Gemmer…" : "Bekræft booking"}
        </button>
      </div>
    </section>
  );
}

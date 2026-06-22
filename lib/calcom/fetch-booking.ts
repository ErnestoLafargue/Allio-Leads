const CAL_API_VERSION = "2024-08-13";

/** Tolerance when comparing Allio meeting time to Cal booking start. */
export const CAL_BOOKING_TIME_TOLERANCE_MS = 60 * 1000;

export type CalBookingStatus =
  | "accepted"
  | "pending"
  | "cancelled"
  | "rejected"
  | "awaiting_host"
  | string;

export type CalBooking = {
  uid: string;
  status: CalBookingStatus;
  cancellationReason?: string;
  start?: string;
  meetingUrl?: string;
  location?: string;
  attendees?: { absent?: boolean; email?: string }[];
};

function host(): string {
  return (process.env.CALCOM_HOST ?? "").trim() || "api.cal.com";
}

function apiKey(): string {
  return (process.env.CALCOM_API_KEY ?? "").trim();
}

export function calBookingMeetingUrl(b: CalBooking): string | null {
  const u = (b.meetingUrl ?? "").trim() || (b.location ?? "").trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

/** Slår en booking op i Cal.eu. Returnerer null ved 404/fejl. */
export async function fetchCalBooking(uid: string): Promise<CalBooking | null> {
  if (!apiKey() || !uid.trim()) return null;

  const url = `https://${host()}/v2/bookings/${encodeURIComponent(uid)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "cal-api-version": CAL_API_VERSION,
      },
    });
  } catch (err) {
    console.error(`[calcom] netværksfejl for uid=${uid}:`, (err as Error).message);
    return null;
  }
  if (!res.ok) {
    if (res.status !== 404) {
      console.error(`[calcom] Cal.eu ${res.status} for uid=${uid}`);
    }
    return null;
  }
  const json = (await res.json().catch(() => null)) as { data?: CalBooking } | null;
  return json?.data ?? null;
}

export function calBookingStartMatches(
  bookingStart: string | undefined,
  scheduledFor: Date,
  toleranceMs = CAL_BOOKING_TIME_TOLERANCE_MS,
): boolean {
  if (!bookingStart) return false;
  const t = new Date(bookingStart).getTime();
  if (Number.isNaN(t)) return false;
  return Math.abs(t - scheduledFor.getTime()) <= toleranceMs;
}

export function isCalBookingInactive(status: CalBookingStatus | undefined): boolean {
  return status === "cancelled" || status === "rejected";
}

export type CalBookingRefreshInput = {
  calComBookingUid: string | null;
  meetingScheduledFor: Date | null;
};

/**
 * True when Allio should create/replace a Cal.eu booking for this lead.
 */
export async function calBookingNeedsRefresh(lead: CalBookingRefreshInput): Promise<boolean> {
  if (!lead.meetingScheduledFor) return false;
  if (!lead.calComBookingUid) return true;

  const booking = await fetchCalBooking(lead.calComBookingUid);
  if (!booking) return true;
  if (isCalBookingInactive(booking.status)) return true;
  if (!calBookingStartMatches(booking.start, lead.meetingScheduledFor)) return true;
  return false;
}

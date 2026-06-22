/**
 * Cal.eu (Cal.com EU-region) booking-klient.
 *
 * VIGTIGT: Allio er på EU-regionen — sæt `CALCOM_HOST=api.cal.eu` i miljøet.
 * En API-nøgle fra app.cal.eu virker IKKE mod api.cal.com (giver 401 Invalid API Key).
 *
 * Kun ekstern booking + mødelink oprettes her. Den interne Allio-booking
 * (lib/booking/*) forbliver kilde til sandhed; Cal.eu giver kalender-sync + Google Meet-link.
 */

const CAL_API_VERSION = "2024-08-13";

function host(): string {
  return (process.env.CALCOM_HOST ?? "").trim() || "api.cal.com";
}

function apiKey(): string {
  return (process.env.CALCOM_API_KEY ?? "").trim();
}

function eventTypeId(): number {
  const n = Number((process.env.CALCOM_EVENT_TYPE_ID ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isCalComConfigured(): boolean {
  return Boolean(apiKey()) && eventTypeId() > 0;
}

export type CalComBookingInput = {
  /** Mødets starttidspunkt (UTC ISO-string udledes herfra). */
  start: Date;
  attendeeName: string;
  attendeeEmail: string;
  /** Valgfrit telefonnummer (E.164) — vises på bookingen hvis event type understøtter det. */
  attendeePhone?: string;
  /** Valgfrie noter til værten. */
  notes?: string;
};

export type CalComBookingResult = {
  uid: string;
  /** Google Meet / Cal Video-link hvis tilgængeligt. */
  meetingUrl: string | null;
};

/**
 * Opretter en booking via Cal.eu v2 API.
 * Kaster ved fejl — kaldere skal fange og behandle ikke-fatalt (intern booking må ikke blokeres).
 */
export async function createCalComBooking(
  input: CalComBookingInput,
): Promise<CalComBookingResult> {
  if (!isCalComConfigured()) {
    throw new Error(
      "Cal.eu er ikke konfigureret (CALCOM_API_KEY / CALCOM_EVENT_TYPE_ID mangler).",
    );
  }

  const url = `https://${host()}/v2/bookings`;
  const body: Record<string, unknown> = {
    eventTypeId: eventTypeId(),
    start: input.start.toISOString(),
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      timeZone: "Europe/Copenhagen",
      language: "da",
      ...(input.attendeePhone ? { phoneNumber: input.attendeePhone } : {}),
    },
    ...(input.notes ? { bookingFieldsResponses: { notes: input.notes } } : {}),
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "cal-api-version": CAL_API_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Cal.eu netværksfejl: ${(err as Error).message}`);
  }

  const text = await res.text();
  let json: { data?: Record<string, unknown>; error?: unknown } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* ignore parse error — håndteres via status nedenfor */
  }

  if (!res.ok) {
    const detail =
      (json.error as { message?: string } | undefined)?.message ||
      text.slice(0, 300) ||
      res.statusText;
    throw new Error(`Cal.eu booking fejlede (${res.status}): ${detail}`);
  }

  const data = (json.data ?? {}) as Record<string, unknown>;
  const uid = typeof data.uid === "string" ? data.uid : "";
  if (!uid) {
    throw new Error("Cal.eu svarede uden booking-uid.");
  }

  const meetingUrl =
    pickString(data.meetingUrl) ?? pickString(data.location) ?? null;

  return { uid, meetingUrl };
}

/**
 * Aflyser en booking via Cal.eu v2 API. Ikke-fatal — kaster ved fejl.
 */
export async function cancelCalComBooking(
  uid: string,
  reason = "Aflyst i Allio",
): Promise<void> {
  if (!isCalComConfigured() || !uid) return;
  const url = `https://${host()}/v2/bookings/${encodeURIComponent(uid)}/cancel`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "cal-api-version": CAL_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cancellationReason: reason }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cal.eu aflysning fejlede (${res.status}): ${text.slice(0, 200)}`);
  }
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

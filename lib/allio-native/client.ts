/**
 * Allio-Native REST-klient (https://api.allio.dk).
 * Spejler møder fra Allio-Leads til Native-kalenderen.
 */

import {
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

function baseUrl(): string {
  return (process.env.ALLIO_API_BASE ?? "https://api.allio.dk").trim().replace(/\/$/, "");
}

function apiKey(): string {
  return (process.env.ALLIO_API_KEY ?? "").trim();
}

export function isAllioNativeConfigured(): boolean {
  return Boolean(apiKey()) && Boolean(serviceIdForMeetingType("ONLINE") || serviceIdForMeetingType("PHYSICAL"));
}

export function serviceIdForMeetingType(type: MeetingType | string): string {
  const t = normalizeMeetingType(type);
  if (t === MEETING_TYPE_PHYSICAL) {
    return (process.env.ALLIO_SERVICE_ID_PHYSICAL ?? "").trim();
  }
  return (process.env.ALLIO_SERVICE_ID_ONLINE ?? "").trim();
}

export function allioEmployeeId(): string | undefined {
  const id = (process.env.ALLIO_EMPLOYEE_ID ?? "").trim();
  return id || undefined;
}

type AllioApiError = {
  code?: string;
  message?: string;
  details?: unknown;
};

async function allioFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: AllioApiError; status: number; raw: string }> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      status: 0,
      error: { code: "NOT_CONFIGURED", message: "ALLIO_API_KEY mangler" },
      raw: "",
    };
  }
  const url = `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: { code: "NETWORK", message: (err as Error).message },
      raw: "",
    };
  }
  const text = await res.text();
  let json: { success?: boolean; data?: T; error?: AllioApiError } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok || json.success === false) {
    return {
      ok: false,
      status: res.status,
      error: json.error ?? { message: text.slice(0, 300) || res.statusText },
      raw: text,
    };
  }
  return { ok: true, status: res.status, data: (json.data as T) ?? (json as unknown as T) };
}

export type AllioCustomer = {
  id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  phone?: string;
};

export type AllioBooking = {
  id: string;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  employee_id?: string | null;
  service_ids?: string[];
  start_time?: string;
  end_time?: string;
  duration_minutes?: number;
  status?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: parts[0] ?? "Kunde", last_name: "-" };
  return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

/** Formatér starttid med timezone-offset (Europe/Copenhagen wall clock). */
export function formatAllioStartTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const m = get("month");
  const d = get("day");
  let h = get("hour");
  if (h === "24") h = "00";
  const min = get("minute");
  const s = get("second");
  const tzRaw = get("timeZoneName") || "GMT+02:00";
  const tzMatch = tzRaw.match(/GMT([+-]\d{2}):?(\d{2})?/);
  const offset = tzMatch
    ? `${tzMatch[1]}${tzMatch[2] ? `:${tzMatch[2]}` : ":00"}`
    : "+02:00";
  return `${y}-${m}-${d}T${h}:${min}:${s}${offset}`;
}

export async function listCustomers(search: string, limit = 5): Promise<AllioCustomer[]> {
  const qs = new URLSearchParams({
    limit: String(limit),
    page: "1",
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const res = await allioFetch<AllioCustomer[]>(`/v1/customers?${qs}`);
  if (!res.ok) return [];
  return Array.isArray(res.data) ? res.data : [];
}

function existingCustomerIdFromError(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const id = (details as { existing_customer_id?: unknown }).existing_customer_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function getCustomer(customerId: string): Promise<AllioCustomer | null> {
  const res = await allioFetch<AllioCustomer>(`/v1/customers/${encodeURIComponent(customerId)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(
      `Allio-Native getCustomer: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    );
  }
  return res.data;
}

export type CreateAllioCustomerInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  /** Klinikkens/mødets adresse (lead.address eller meetingAddress). */
  address?: string;
  /** CVR fra lead.cvr — API-felt: cvr_number. */
  cvr?: string;
};

export async function createCustomer(input: CreateAllioCustomerInput): Promise<AllioCustomer> {
  const body: Record<string, unknown> = {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
  };
  if (input.phone?.trim()) body.phone = input.phone.trim();
  if (input.address?.trim()) body.address = input.address.trim();
  if (input.cvr?.trim()) body.cvr_number = input.cvr.trim();

  const res = await allioFetch<AllioCustomer>("/v1/customers", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const duplicate =
      res.error.code === "DUPLICATE_EMAIL" || res.error.code === "DUPLICATE_PHONE";
    if (duplicate) {
      const existingId = existingCustomerIdFromError(res.error.details);
      if (existingId) {
        const byId = await getCustomer(existingId);
        if (byId) return byId;
      }
      const needle = (input.phone || input.email).trim().toLowerCase();
      const existing = await listCustomers(needle, 10);
      const match = existing.find((c) => {
        const email = (c.email ?? "").trim().toLowerCase();
        const phone = (c.phone ?? "").replace(/\D/g, "");
        const wantPhone = (input.phone ?? "").replace(/\D/g, "");
        return (
          email === input.email.trim().toLowerCase() ||
          (wantPhone.length >= 8 && phone.endsWith(wantPhone.slice(-8)))
        );
      });
      if (match) return match;
    }
    throw new Error(
      `Allio-Native createCustomer: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    );
  }
  return res.data;
}

export async function createBooking(input: {
  customer_id: string;
  service_ids: string[];
  start_time: string;
  /** Mødelængde i minutter (60 online / 90 fysisk). */
  duration_minutes?: number;
  employee_id?: string;
  notes?: string;
  allow_outside_opening_hours?: boolean;
  /** Undgå SMS/e-mail til kunden ved oprettelse (default false i vores sync). */
  notify_customer?: boolean;
}): Promise<AllioBooking> {
  const res = await allioFetch<AllioBooking>("/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      customer_id: input.customer_id,
      service_ids: input.service_ids,
      start_time: input.start_time,
      ...(typeof input.duration_minutes === "number"
        ? { duration_minutes: input.duration_minutes }
        : {}),
      ...(input.employee_id ? { employee_id: input.employee_id } : {}),
      ...(input.notes != null ? { notes: input.notes } : {}),
      ...(input.allow_outside_opening_hours ? { allow_outside_opening_hours: true } : {}),
      notify_customer: input.notify_customer ?? false,
    }),
  });
  if (!res.ok) {
    const err = new Error(
      `Allio-Native createBooking: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    ) as Error & { code?: string; status?: number };
    err.code = res.error.code;
    err.status = res.status;
    throw err;
  }
  return res.data;
}

export async function updateBooking(
  bookingId: string,
  patch: {
    start_time?: string;
    duration_minutes?: number;
    employee_id?: string;
    status?: string;
    notes?: string | null;
    notify_customer?: boolean;
  },
): Promise<AllioBooking> {
  const res = await allioFetch<AllioBooking>(`/v1/bookings/${encodeURIComponent(bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = new Error(
      `Allio-Native updateBooking: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    ) as Error & { code?: string; status?: number };
    err.code = res.error.code;
    err.status = res.status;
    throw err;
  }
  return res.data;
}

export async function cancelBooking(bookingId: string): Promise<AllioBooking | null> {
  const res = await allioFetch<AllioBooking>(`/v1/bookings/${encodeURIComponent(bookingId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(
      `Allio-Native cancelBooking: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    );
  }
  return res.data;
}

export async function listBookings(opts: {
  from?: string;
  to?: string;
  updated_since?: string;
  status?: string;
  limit?: number;
  page?: number;
}): Promise<AllioBooking[]> {
  const qs = new URLSearchParams();
  if (opts.from) qs.set("from", opts.from);
  if (opts.to) qs.set("to", opts.to);
  if (opts.updated_since) qs.set("updated_since", opts.updated_since);
  if (opts.status) qs.set("status", opts.status);
  qs.set("limit", String(opts.limit ?? 100));
  qs.set("page", String(opts.page ?? 1));
  const res = await allioFetch<AllioBooking[]>(`/v1/bookings?${qs}`);
  if (!res.ok) {
    throw new Error(
      `Allio-Native listBookings: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    );
  }
  return Array.isArray(res.data) ? res.data : [];
}

export async function getBooking(bookingId: string): Promise<AllioBooking | null> {
  const res = await allioFetch<AllioBooking>(`/v1/bookings/${encodeURIComponent(bookingId)}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(
      `Allio-Native getBooking: ${res.error.code ?? ""} ${res.error.message ?? res.raw}`,
    );
  }
  return res.data;
}

/**
 * Danske labels og farver til «Scripts & Træning» (analysens enum-værdier → UI).
 */
import type { CustomerSignal, ObjectionCategory, Phase } from "@/lib/call-analysis/schema";

export const PHASE_LABELS: Record<Phase, string> = {
  opening: "Åbning",
  qualification: "Kvalificering",
  discovery: "Behovsafdækning",
  solution: "Løsning",
  close: "Close",
  confirmation: "Bekræftelse",
};

export const OBJECTION_LABELS: Record<ObjectionCategory, string> = {
  has_booking_system: "Har allerede bookingsystem",
  has_agency: "Har allerede marketingbureau",
  no_time: "Har ikke tid",
  price: "Pris / for dyrt",
  send_email: "Send noget på mail",
  not_interested: "Ikke interesseret",
  think_about_it: "Vil tænke over det",
  talk_to_partner: "Skal tale med partner",
  fully_booked: "Er fuldt booket",
  bad_timing: "Dårligt tidspunkt",
  other: "Andet",
};

export const SIGNAL_LABELS: Record<CustomerSignal, string> = {
  tryghed: "Tryghed",
  klarhed: "Klarhed",
  okonomi: "Økonomi",
  skepsis: "Skepsis",
  timing: "Timing",
  lav_interesse: "Lav interesse",
};

export const PITCH_LABELS: Record<string, string> = {
  pitch_5: "Pitch 5",
  pitch_6: "Pitch 6",
  pitch_7: "Pitch 7",
  onlinebooq_free: "Onlinebooq → Booking Free",
  pitch_nynyny: "Pitch NyNyNy",
  other: "Anden",
  unclear: "Uklar",
};

export const CALL_TYPE_LABELS: Record<string, string> = {
  cold_call: "Koldt opkald",
  follow_up: "Opfølgning",
  rebooking: "Genbooking",
  gatekeeper: "Receptionist",
  voicemail: "Telefonsvarer",
  wrong_person: "Forkert person",
  other: "Andet",
};

export const NEXT_STEP_LABELS: Record<string, string> = {
  meeting_booked: "Møde booket",
  callback: "Ringes op igen",
  send_email: "Sender mail",
  none: "Intet aftalt",
  other: "Andet",
};

export const OUTCOME_LABELS: Record<string, string> = {
  MEETING_BOOKED: "Møde booket",
  CALLBACK_SCHEDULED: "Tilbagekald",
  NOT_INTERESTED: "Ikke interesseret",
  UNQUALIFIED: "Ikke kvalificeret",
  VOICEMAIL: "Telefonsvarer",
  NOT_HOME: "Ikke hjemme",
  NEW: "Ny",
};

export const OUTCOME_BADGE: Record<string, string> = {
  MEETING_BOOKED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  CALLBACK_SCHEDULED: "bg-sky-100 text-sky-800 ring-sky-200",
  NOT_INTERESTED: "bg-rose-100 text-rose-800 ring-rose-200",
  UNQUALIFIED: "bg-stone-200 text-stone-700 ring-stone-300",
};

/** Grøn = stærkt, gul = kan forbedres, rød = mistet mulighed. */
export const MOMENT_STYLE = {
  strong: { label: "Godt", card: "border-emerald-300 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-800" },
  improve: { label: "Kan forbedres", card: "border-amber-300 bg-amber-50", dot: "bg-amber-500", text: "text-amber-800" },
  missed: { label: "Mistet mulighed", card: "border-rose-300 bg-rose-50", dot: "bg-rose-500", text: "text-rose-800" },
} as const;

export const QUALITY_STYLE: Record<string, string> = {
  strong: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  ok: "bg-amber-100 text-amber-800 ring-amber-200",
  weak: "bg-rose-100 text-rose-800 ring-rose-200",
  none: "bg-stone-100 text-stone-500 ring-stone-200",
};

export const QUALITY_LABELS: Record<string, string> = { strong: "Stærk", ok: "OK", weak: "Svag", none: "Ikke håndteret" };

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return "text-stone-400";
  if (score >= 70) return "text-emerald-700";
  if (score >= 45) return "text-amber-700";
  return "text-rose-700";
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

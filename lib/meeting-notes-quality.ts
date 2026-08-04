/**
 * Kvalitetstjek af lead-noter ved «Møde booket».
 *
 * Noterne er sælgerens hukommelse til næste møde (hvad kunden fandt
 * interessant, hvad der blev lovet). En tom note — eller bare en
 * e-mailadresse — er ikke nok, så booking blokeres indtil noterne er
 * beskrivende. Delt mellem UI (dialog før save) og API (400-guard).
 */

/** Minimum antal meningsfulde tegn efter e-mailadresser er fjernet. */
export const MEETING_NOTES_MIN_CHARS = 80;

const EMAIL_ANYWHERE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Fjern alle e-mailadresser fra teksten (de tæller ikke som "rigtige" noter). */
export function stripEmails(text: string): string {
  return text.replace(EMAIL_ANYWHERE_RE, " ");
}

/** Normalisér til den tekst der reelt tæller: uden e-mails og sammenfoldet whitespace. */
function meaningfulText(notes: string): string {
  return stripEmails(notes).replace(/\s+/g, " ").trim();
}

export type MeetingNotesInsufficientReason = "empty" | "email_only" | "too_short";

/**
 * Returnerer årsagen til at noterne er utilstrækkelige til mødebooking,
 * eller null hvis de er gode nok.
 */
export function meetingNotesInsufficientReason(
  notes: string | null | undefined,
): MeetingNotesInsufficientReason | null {
  const raw = (notes ?? "").trim();
  if (!raw) return "empty";

  const meaningful = meaningfulText(raw);
  if (!meaningful) return "email_only";
  if (meaningful.length < MEETING_NOTES_MIN_CHARS) return "too_short";
  return null;
}

/** True hvis noterne er tilstrækkelige til at booke møde. */
export function isMeetingNotesSufficient(notes: string | null | undefined): boolean {
  return meetingNotesInsufficientReason(notes) === null;
}

/** Serverside-fejltekst (bruges i 400-svar). */
export const MEETING_NOTES_REQUIRED_ERROR =
  "Noterne på leadet er ikke tilstrækkelige til at booke møde. " +
  "Beskriv hvad kunden fandt interessant, og hvad der blev aftalt/lovet på opkaldet " +
  `(mindst ${MEETING_NOTES_MIN_CHARS} tegn — en e-mailadresse alene tæller ikke).`;

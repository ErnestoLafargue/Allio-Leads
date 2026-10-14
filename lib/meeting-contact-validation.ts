import {
  MEETING_TYPE_PHYSICAL,
  type MeetingType,
  normalizeMeetingType,
} from "@/lib/meeting-type";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MeetingContactFieldKey =
  | "meetingCompany"
  | "name"
  | "email"
  | "phone"
  | "address";

export type MeetingContactFieldErrors = Partial<Record<MeetingContactFieldKey, string>>;

export function validateMeetingContactFields(
  name: string,
  email: string,
  phonePrivate: string,
  meetingCompanyName?: string,
  opts?: { meetingType?: MeetingType | string; meetingAddress?: string },
): MeetingContactFieldErrors | null {
  const errors: MeetingContactFieldErrors = {};
  if (meetingCompanyName !== undefined && !meetingCompanyName.trim()) {
    errors.meetingCompany = "Virksomhedsnavn til mødet er påkrævet.";
  }
  if (!name.trim()) errors.name = "Navn på person til mødet er påkrævet.";
  if (!email.trim()) errors.email = "Personens e-mail er påkrævet.";
  else if (!EMAIL_RE.test(email.trim())) errors.email = "Indtast en gyldig e-mailadresse.";
  if (!phonePrivate.trim()) errors.phone = "Privat telefonnummer er påkrævet.";
  const type = normalizeMeetingType(opts?.meetingType);
  if (type === MEETING_TYPE_PHYSICAL && !(opts?.meetingAddress ?? "").trim()) {
    errors.address = "Mødeadresse er påkrævet ved fysisk møde.";
  }
  return Object.keys(errors).length ? errors : null;
}

export function meetingContactEmailValid(email: string): boolean {
  const t = email.trim();
  return t.length > 0 && EMAIL_RE.test(t);
}

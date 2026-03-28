const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MeetingContactFieldKey = "name" | "email" | "phone";

export type MeetingContactFieldErrors = Partial<Record<MeetingContactFieldKey, string>>;

export function validateMeetingContactFields(
  name: string,
  email: string,
  phonePrivate: string,
): MeetingContactFieldErrors | null {
  const errors: MeetingContactFieldErrors = {};
  if (!name.trim()) errors.name = "Navn på person til mødet er påkrævet.";
  if (!email.trim()) errors.email = "Personens e-mail er påkrævet.";
  else if (!EMAIL_RE.test(email.trim())) errors.email = "Indtast en gyldig e-mailadresse.";
  if (!phonePrivate.trim()) errors.phone = "Privat telefonnummer er påkrævet.";
  return Object.keys(errors).length ? errors : null;
}

export function meetingContactEmailValid(email: string): boolean {
  const t = email.trim();
  return t.length > 0 && EMAIL_RE.test(t);
}

import { describe, expect, it } from "vitest";
import {
  MEETING_NOTES_MIN_CHARS,
  isMeetingNotesSufficient,
  meetingNotesInsufficientReason,
  stripEmails,
} from "@/lib/meeting-notes-quality";

const GOOD_NOTE =
  "Kunden bruger Geckobooking og har brugt det i 5 år. Hun vil gerne samle alle systemer ét sted. " +
  "Vi lovede at vise genaktivering og anmeldelser på mødet.";

describe("stripEmails", () => {
  it("fjerner e-mailadresser fra teksten", () => {
    expect(stripEmails("kontakt hej@klinik.dk i morgen").replace(/\s+/g, " ").trim()).toBe(
      "kontakt i morgen",
    );
  });

  it("fjerner flere e-mails", () => {
    const out = stripEmails("a@b.dk og c.d@e-f.com");
    expect(out).not.toContain("@");
  });
});

describe("meetingNotesInsufficientReason", () => {
  it("tom / whitespace / null → empty", () => {
    expect(meetingNotesInsufficientReason("")).toBe("empty");
    expect(meetingNotesInsufficientReason("   \n ")).toBe("empty");
    expect(meetingNotesInsufficientReason(null)).toBe("empty");
    expect(meetingNotesInsufficientReason(undefined)).toBe("empty");
  });

  it("kun en e-mailadresse → email_only", () => {
    expect(meetingNotesInsufficientReason("hej@klinik.dk")).toBe("email_only");
    expect(meetingNotesInsufficientReason("  info@salon.dk  ")).toBe("email_only");
    expect(meetingNotesInsufficientReason("a@b.dk c@d.dk")).toBe("email_only");
  });

  it("kort tekst + e-mail → too_short", () => {
    expect(meetingNotesInsufficientReason("mail: hej@klinik.dk, ring tirsdag")).toBe("too_short");
  });

  it("kort tekst uden e-mail → too_short", () => {
    expect(meetingNotesInsufficientReason("virker sød")).toBe("too_short");
  });

  it("god beskrivende note → null", () => {
    expect(meetingNotesInsufficientReason(GOOD_NOTE)).toBeNull();
  });

  it("god note + e-mail er stadig ok", () => {
    expect(meetingNotesInsufficientReason(`${GOOD_NOTE} Kontakt: hej@klinik.dk`)).toBeNull();
  });

  it("grænsen ligger på MEETING_NOTES_MIN_CHARS meningsfulde tegn", () => {
    const justUnder = "x".repeat(MEETING_NOTES_MIN_CHARS - 1);
    const justEnough = "x".repeat(MEETING_NOTES_MIN_CHARS);
    expect(meetingNotesInsufficientReason(justUnder)).toBe("too_short");
    expect(meetingNotesInsufficientReason(justEnough)).toBeNull();
  });
});

describe("isMeetingNotesSufficient", () => {
  it("spejler reason === null", () => {
    expect(isMeetingNotesSufficient(GOOD_NOTE)).toBe(true);
    expect(isMeetingNotesSufficient("hej@klinik.dk")).toBe(false);
    expect(isMeetingNotesSufficient("")).toBe(false);
  });
});

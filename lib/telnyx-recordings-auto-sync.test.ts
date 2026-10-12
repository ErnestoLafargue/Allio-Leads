import { describe, expect, it } from "vitest";
import {
  isMeetingBookedRecordingReason,
  meetsAutoSyncTalkThreshold,
  MIN_TALK_SECONDS_FOR_AUTO_SYNC,
  recordingSyncFromIso,
  shouldSkipIfLeadAlreadyHasRecording,
  talkSecondsFromCallTimestamps,
} from "@/lib/telnyx-recordings-auto-sync";

describe("talkSecondsFromCallTimestamps", () => {
  const answeredAt = new Date("2026-08-05T10:00:00.000Z");
  const bridgedAt = new Date("2026-08-05T10:00:10.000Z");
  const endedAt = new Date("2026-08-05T10:01:20.000Z");

  it("bruger bridgedAt før answeredAt", () => {
    expect(
      talkSecondsFromCallTimestamps({ endedAt, bridgedAt, answeredAt }),
    ).toBe(70);
  });

  it("falder tilbage til answeredAt når bridgedAt mangler", () => {
    expect(
      talkSecondsFromCallTimestamps({ endedAt, bridgedAt: null, answeredAt }),
    ).toBe(80);
  });

  it("returnerer 0 når start eller slut mangler", () => {
    expect(talkSecondsFromCallTimestamps({ endedAt: null, answeredAt })).toBe(0);
    expect(talkSecondsFromCallTimestamps({ endedAt, answeredAt: null })).toBe(0);
  });

  it("returnerer 0 når end er før start", () => {
    expect(
      talkSecondsFromCallTimestamps({
        endedAt: answeredAt,
        answeredAt: endedAt,
      }),
    ).toBe(0);
  });
});

describe("meetsAutoSyncTalkThreshold", () => {
  it(`kræver mindst ${MIN_TALK_SECONDS_FOR_AUTO_SYNC} sekunder`, () => {
    expect(meetsAutoSyncTalkThreshold(59)).toBe(false);
    expect(meetsAutoSyncTalkThreshold(60)).toBe(true);
    expect(meetsAutoSyncTalkThreshold(900)).toBe(true);
  });
});

describe("møde booket hard rule", () => {
  it("kender møde-booket reasons", () => {
    expect(isMeetingBookedRecordingReason("meeting_booked")).toBe(true);
    expect(isMeetingBookedRecordingReason("meeting_booked:backfill")).toBe(true);
    expect(isMeetingBookedRecordingReason("cron:meeting_booked")).toBe(true);
    expect(isMeetingBookedRecordingReason("hangup_long_call")).toBe(false);
  });

  it("springer ikke over eksisterende filer når møde er booket", () => {
    expect(shouldSkipIfLeadAlreadyHasRecording("meeting_booked")).toBe(false);
    expect(shouldSkipIfLeadAlreadyHasRecording("hangup_long_call")).toBe(true);
    expect(shouldSkipIfLeadAlreadyHasRecording("webrtc_long_call")).toBe(true);
  });

  it("henter uden 14-dages grænse når møde er booket", () => {
    expect(recordingSyncFromIso("meeting_booked")).toBeNull();
    expect(recordingSyncFromIso("hangup_long_call")).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });
});

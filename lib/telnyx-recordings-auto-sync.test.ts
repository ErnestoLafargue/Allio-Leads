import { describe, expect, it } from "vitest";
import {
  meetsAutoSyncTalkThreshold,
  MIN_TALK_SECONDS_FOR_AUTO_SYNC,
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

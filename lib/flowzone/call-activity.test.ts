import { describe, expect, it } from "vitest";
import { buildCallActivity, buildCallHistory, callActivityForDay, copenhagenDayAndBucket } from "./call-activity";

/** Dansk tid: vintertid (UTC+1) fra 25. oktober 2026, sommertid (UTC+2) før. */
const dk = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00${day < "2026-10-25" ? "+02:00" : "+01:00"}`);

describe("copenhagenDayAndBucket", () => {
  it("bruger dansk tid til dag og kvarter", () => {
    expect(copenhagenDayAndBucket(dk("2026-11-05", "10:20"))).toEqual({ dayKey: "2026-11-05", bucket: 41 });
    // 23:50 UTC den 4. er 00:50 dansk den 5.
    expect(copenhagenDayAndBucket(new Date("2026-11-04T23:50:00Z"))).toEqual({ dayKey: "2026-11-05", bucket: 3 });
  });
});

describe("buildCallActivity", () => {
  it("tæller den valgte dag pr. kvarter", () => {
    const a = buildCallActivity("2026-11-05", [dk("2026-11-05", "10:15"), dk("2026-11-05", "10:29"), dk("2026-11-05", "10:30")]);
    expect(a.day[41]).toBe(2); // 10:15–10:30
    expect(a.day[42]).toBe(1); // 10:30–10:45
  });

  it("gennemsnit over de seneste 10 dage med opkald, før den valgte dag", () => {
    const calls: Date[] = [];
    // 12 aktive dage i oktober med 1 opkald kl. 10:20; den ældste har 2 ekstra som ikke må tælle med
    for (let d = 10; d < 22; d++) calls.push(dk(`2026-10-${d}`, "10:20"));
    calls.push(dk("2026-10-10", "10:21"), dk("2026-10-10", "10:22"));
    // Dage efter den valgte dag tæller ikke med
    calls.push(dk("2026-11-06", "10:20"), dk("2026-11-06", "10:21"));
    const a = buildCallActivity("2026-11-05", calls);
    expect(a.averageDays).toBe(10);
    expect(a.average[41]).toBe(1);
    expect(a.day.every((n) => n === 0)).toBe(true);
  });

  it("ingen historik giver nul i gennemsnit", () => {
    const a = buildCallActivity("2026-11-05", []);
    expect(a.averageDays).toBe(0);
    expect(a.average.every((n) => n === 0)).toBe(true);
  });
});

describe("møder i grafen", () => {
  it("tæller møder pr. kvarter på den valgte dag", () => {
    const h = buildCallHistory([dk("2026-11-05", "10:31")], [dk("2026-11-05", "10:31"), dk("2026-11-04", "11:00")]);
    const a = callActivityForDay(h, "2026-11-05");
    expect(a.meetings[42]).toBe(1); // 10:30–10:45
    expect(a.meetings.reduce((x, y) => x + y, 0)).toBe(1);
    expect(h.meetings).toEqual({ "2026-11-05": 1, "2026-11-04": 1 });
  });

  it("tæller gode samtaler pr. kvarter på den valgte dag", () => {
    const h = buildCallHistory([dk("2026-11-05", "10:31")], [], [dk("2026-11-05", "10:31"), dk("2026-11-05", "13:40")]);
    const a = callActivityForDay(h, "2026-11-05");
    expect(a.goodConversations[42]).toBe(1); // 10:30–10:45
    expect(a.goodConversations[54]).toBe(1); // 13:30–13:45
  });
});

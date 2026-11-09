import { describe, expect, it } from "vitest";
import { benchmarkCurve, benchmarkForBlock, weekStartKey, WORKDAY_BLOCK } from "./call-benchmark";
import type { CallHistory } from "./call-activity";

const BLOCK_1 = { id: "calling-1", start: 615, end: 765 }; // 10:15–12:45 = kvarter 41–50
const BLOCK_3 = { id: "calling-3", start: 945, end: 1005 };

/** Hverdage i oktober 2026 (1. okt. er en torsdag). */
const WEEKDAYS = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`).filter((d) => {
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
  return wd !== 0 && wd !== 6;
});

/** Historik hvor hver dag har `calls` opkald i Ringeblok 1 (lagt i kvarter 41) og `meetings` møder. */
function history(days: Array<{ day: string; calls: number; meetings: number }>): CallHistory {
  const h: CallHistory = { bucketMinutes: 15, days: {}, meetings: {}, meetingBuckets: {}, goodConversationBuckets: {} };
  for (const d of days) {
    h.days[d.day] = { 41: d.calls };
    if (d.meetings) h.meetings[d.day] = d.meetings;
  }
  return h;
}

describe("weekStartKey", () => {
  it("finder mandagen i ugen", () => {
    expect(weekStartKey("2026-11-05")).toBe("2026-11-02"); // torsdag → mandag
    expect(weekStartKey("2026-11-08")).toBe("2026-11-02"); // søndag hører til samme uge
    expect(weekStartKey("2026-11-09")).toBe("2026-11-09");
  });
});

describe("benchmarkForBlock", () => {
  it("bruger det faste mål ved under 5 salgsdage", () => {
    const h = history(WEEKDAYS.slice(0, 4).map((day) => ({ day, calls: 60, meetings: 2 })));
    expect(benchmarkForBlock(h, "2026-11-05", BLOCK_1)).toEqual({ target: 47, source: "fixed", salesDays: 4 });
  });

  it("tager medianen af de 10 dage med flest møder, inden for gulv og loft", () => {
    const days = WEEKDAYS.slice(0, 12).map((day, i) => ({ day, calls: 50 + i, meetings: i < 10 ? 2 : 1 }));
    // De 10 dage med 2 møder har 50–59 opkald → median 54,5 → 55
    expect(benchmarkForBlock(history(days), "2026-11-05", BLOCK_1)).toEqual({ target: 55, source: "personal", salesDays: 10 });
  });

  it("holder målet mellem gulv og loft", () => {
    const high = WEEKDAYS.slice(0, 6).map((day) => ({ day, calls: 120, meetings: 1 }));
    expect(benchmarkForBlock(history(high), "2026-11-05", BLOCK_1).target).toBe(65);
    const low = WEEKDAYS.slice(0, 6).map((day) => ({ day, calls: 20, meetings: 1 }));
    expect(benchmarkForBlock(history(low), "2026-11-05", BLOCK_1).target).toBe(47);
  });

  it("ser bort fra dage uden møder, dage med under 5 opkald i blokken og dage i indeværende uge", () => {
    const days = [
      ...WEEKDAYS.slice(0, 5).map((day) => ({ day, calls: 50, meetings: 0 })), // ingen møder
      ...WEEKDAYS.slice(5, 10).map((day) => ({ day, calls: 3, meetings: 3 })), // næsten ikke ringet i blokken
      { day: "2026-11-03", calls: 60, meetings: 4 }, // samme uge som 5. nov.
    ];
    expect(benchmarkForBlock(history(days), "2026-11-05", BLOCK_1).source).toBe("fixed");
  });

  it("tæller kun opkald i den pågældende blok", () => {
    const h = history(WEEKDAYS.slice(0, 6).map((day) => ({ day, calls: 60, meetings: 2 })));
    // Ingen opkald i Ringeblok 3 → for få salgsdage der → fast mål 20
    expect(benchmarkForBlock(h, "2026-11-05", BLOCK_3)).toEqual({ target: 20, source: "fixed", salesDays: 0 });
  });

  it("hele dagen 09–17 bruger 150–200 som gulv og loft", () => {
    expect(benchmarkForBlock(history([]), "2026-11-05", WORKDAY_BLOCK)).toEqual({ target: 150, source: "fixed", salesDays: 0 });
    const days = WEEKDAYS.slice(0, 6).map((day) => ({ day, calls: 170, meetings: 2 }));
    expect(benchmarkForBlock(history(days), "2026-11-05", WORKDAY_BLOCK).target).toBe(170);
  });

  it("fordeler dagens mål efter rytmen på de bedste salgsdage", () => {
    // 6 salgsdage med 120 opkald kl. 10:15 (kvarter 41) og 40 kl. 14:00 (kvarter 56) → mål 160, fordelt 3:1
    const h: CallHistory = { bucketMinutes: 15, days: {}, meetings: {}, meetingBuckets: {}, goodConversationBuckets: {} };
    for (const day of WEEKDAYS.slice(0, 6)) {
      h.days[day] = { 41: 120, 56: 40 };
      h.meetings[day] = 2;
    }
    const { benchmark, perBucket } = benchmarkCurve(h, "2026-11-05", WORKDAY_BLOCK);
    expect(benchmark.target).toBe(160);
    expect(perBucket.get(41)).toBe(120);
    expect(perBucket.get(56)).toBe(40);
    expect(perBucket.get(36)).toBe(0); // 09:00
  });

  it("bruger egen rytme som reserve og ellers en jævn fordeling", () => {
    const empty = history([]);
    const profile = new Array(96).fill(0);
    profile[41] = 1;
    expect(benchmarkCurve(empty, "2026-11-05", WORKDAY_BLOCK, profile).perBucket.get(41)).toBe(150);
    const flat = benchmarkCurve(empty, "2026-11-05", WORKDAY_BLOCK).perBucket;
    expect(flat.size).toBe(32); // 09:00–17:00
    expect(flat.get(36)).toBe(4.7); // 150 / 32
  });
});

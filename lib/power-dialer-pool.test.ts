import { describe, expect, it } from "vitest";
import type { PowerDialerCandidate } from "./power-dialer-batch";
import {
  groupCandidatesByCampaign,
  pickPowerPoolDialRatio,
  planPowerPoolClaims,
  sortPowerPoolCandidates,
} from "./power-dialer-pool";

function cand(
  partial: Partial<PowerDialerCandidate> & Pick<PowerDialerCandidate, "leadId" | "campaignId">,
): PowerDialerCandidate {
  return {
    e164: "+4511111111",
    lastDialAttemptAt: null,
    unansweredAttempts: 0,
    importedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastOutcomeAt: null,
    ...partial,
  };
}

describe("pickPowerPoolDialRatio", () => {
  it("tager højeste ratio", () => {
    expect(pickPowerPoolDialRatio([{ dialRatio: 2 }, { dialRatio: 5 }, { dialRatio: 3 }])).toBe(5);
  });

  it("tom liste → 1", () => {
    expect(pickPowerPoolDialRatio([])).toBe(1);
  });
});

describe("sortPowerPoolCandidates", () => {
  it("færrest forsøg først på tværs af kampagner", () => {
    const sorted = sortPowerPoolCandidates([
      cand({ leadId: "b", campaignId: "c2", unansweredAttempts: 2 }),
      cand({ leadId: "a", campaignId: "c1", unansweredAttempts: 0 }),
      cand({ leadId: "c", campaignId: "c1", unansweredAttempts: 1 }),
    ]);
    expect(sorted.map((c) => c.leadId)).toEqual(["a", "c", "b"]);
  });
});

describe("planPowerPoolClaims", () => {
  it("respekterer per-kampagne room og global newCalls", () => {
    // Nyere importedAt først ved samme forsøg — a2 før a1; c1 har kun 1 plads.
    const candidates = sortPowerPoolCandidates([
      cand({ leadId: "a1", campaignId: "c1", unansweredAttempts: 0 }),
      cand({
        leadId: "a2",
        campaignId: "c1",
        unansweredAttempts: 0,
        importedAt: new Date("2026-01-02"),
      }),
      cand({
        leadId: "b1",
        campaignId: "c2",
        unansweredAttempts: 0,
        importedAt: new Date("2026-01-03"),
      }),
      cand({ leadId: "b2", campaignId: "c2", unansweredAttempts: 1 }),
    ]);
    const room = new Map([
      ["c1", 1],
      ["c2", 2],
    ]);
    const picked = planPowerPoolClaims(candidates, room, 3);
    expect(picked.map((c) => c.leadId)).toEqual(["b1", "a2", "b2"]);
  });

  it("springer kampagne over når room er 0", () => {
    const candidates = [
      cand({ leadId: "a1", campaignId: "c1" }),
      cand({ leadId: "b1", campaignId: "c2" }),
    ];
    const room = new Map([
      ["c1", 0],
      ["c2", 5],
    ]);
    expect(planPowerPoolClaims(candidates, room, 2).map((c) => c.leadId)).toEqual(["b1"]);
  });
});

describe("groupCandidatesByCampaign", () => {
  it("grupperer", () => {
    const by = groupCandidatesByCampaign([
      cand({ leadId: "a", campaignId: "c1" }),
      cand({ leadId: "b", campaignId: "c2" }),
      cand({ leadId: "c", campaignId: "c1" }),
    ]);
    expect([...by.get("c1")!].map((x) => x.leadId)).toEqual(["a", "c"]);
    expect([...by.get("c2")!].map((x) => x.leadId)).toEqual(["b"]);
  });
});

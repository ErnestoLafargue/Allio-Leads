import { describe, expect, it } from "vitest";
import {
  DIAL_POOL_MIN_SHARE,
  dialPoolTargetShares,
  orderDialPoolCampaignsByDeficit,
  type DialPoolCampaignCandidate,
} from "@/lib/dial-pool-weighting";

const camps = (attempts: number[]): DialPoolCampaignCandidate[] =>
  attempts.map((a, i) => ({ id: `c${i}`, nextLeadAttempts: a }));

/** Simulér n opkald, hvor der altid ringes til den første kampagne i rækkefølgen. */
function simulate(candidates: DialPoolCampaignCandidate[], n: number): Map<string, number> {
  const calls = new Map<string, number>();
  let last: string | null = null;
  const ids = candidates.map((c) => c.id);
  for (let i = 0; i < n; i++) {
    const idx: number = last ? ids.indexOf(last) : -1;
    const tie: string[] = [...ids.slice(idx + 1), ...ids.slice(0, idx + 1)];
    const next: string = orderDialPoolCampaignsByDeficit(candidates, calls, tie)[0];
    calls.set(next, (calls.get(next) ?? 0) + 1);
    last = next;
  }
  return calls;
}

describe("dialPoolTargetShares", () => {
  it("giver færrest forsøg den største andel og summerer til 1", () => {
    const s = dialPoolTargetShares(camps([0, 2, 3, 4, 7, 8, 9]));
    const vals = [...s.values()];
    expect(vals.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    for (let i = 1; i < vals.length; i++) expect(vals[i - 1]).toBeGreaterThanOrEqual(vals[i]);
    expect(s.get("c0")).toBeGreaterThan(0.4);
  });

  it("giver alle kampagner mindst minimumsandelen", () => {
    const s = dialPoolTargetShares(camps([0, 0, 0, 20, 30, 40]));
    for (const v of s.values()) expect(v).toBeGreaterThanOrEqual(DIAL_POOL_MIN_SHARE - 1e-9);
    expect([...s.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("deler lige, når alle har samme antal forsøg", () => {
    const s = dialPoolTargetShares(camps([3, 3, 3, 3]));
    for (const v of s.values()) expect(v).toBeCloseTo(0.25);
  });
});

describe("orderDialPoolCampaignsByDeficit", () => {
  it("ringer 2–4 forsøg mere end 7–9 forsøg, men begge får opkald", () => {
    const calls = simulate(camps([2, 3, 4, 7, 8, 9]), 100);
    const low = (calls.get("c0") ?? 0) + (calls.get("c1") ?? 0) + (calls.get("c2") ?? 0);
    const high = (calls.get("c3") ?? 0) + (calls.get("c4") ?? 0) + (calls.get("c5") ?? 0);
    expect(low).toBeGreaterThan(high * 2);
    for (const id of ["c3", "c4", "c5"]) expect(calls.get(id) ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("lader ikke en kampagne med friske leads tage alle opkald", () => {
    const calls = simulate(camps([0, 2, 3, 4, 7, 8, 9, 9]), 40);
    expect(calls.size).toBe(8);
    expect(calls.get("c0")!).toBeLessThan(25);
  });

  it("tager kampagnerne på skift, når de er lige", () => {
    const c = camps([1, 1, 1]);
    expect(orderDialPoolCampaignsByDeficit(c, new Map(), ["c1", "c2", "c0"])[0]).toBe("c1");
    expect(simulate(c, 9)).toEqual(new Map([["c0", 3], ["c1", 3], ["c2", 3]]));
  });

  it("returnerer alle kampagner, så puljen kan gå videre", () => {
    expect(orderDialPoolCampaignsByDeficit(camps([0, 5]), new Map(), []).sort()).toEqual(["c0", "c1"]);
  });
});

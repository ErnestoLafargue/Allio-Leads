import { describe, expect, it } from "vitest";
import {
  campaignWhereForUser,
  isAdminRole,
  isDialPoolMode,
  orderDialPoolRoundRobin,
} from "./campaign-access";

describe("isAdminRole", () => {
  it("kun ADMIN", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SELLER")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("campaignWhereForUser", () => {
  it("admin får tom where (alle kampagner)", () => {
    expect(campaignWhereForUser({ id: "u1", role: "ADMIN" })).toEqual({});
  });

  it("seller filtreres på assignments", () => {
    expect(campaignWhereForUser({ id: "u1", role: "SELLER" })).toEqual({
      assignments: { some: { userId: "u1" } },
    });
  });

  it("uden user → ingen kampagner", () => {
    expect(campaignWhereForUser(null)).toEqual({ id: { in: [] } });
    expect(campaignWhereForUser({ role: "SELLER" })).toEqual({ id: { in: [] } });
  });
});

/** Ren intersection-helper til unit test uden DB */
export function intersectionUserIdsFromRows(
  campaignIds: string[],
  rows: { userId: string; campaignId: string }[],
): string[] {
  const ids = [...new Set(campaignIds)];
  if (ids.length === 0) return [];
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!ids.includes(r.campaignId)) continue;
    let set = byUser.get(r.userId);
    if (!set) {
      set = new Set();
      byUser.set(r.userId, set);
    }
    set.add(r.campaignId);
  }
  const out: string[] = [];
  for (const [userId, set] of byUser) {
    if (set.size === ids.length) out.push(userId);
  }
  return out.sort();
}

describe("intersectionUserIdsFromRows", () => {
  const rows = [
    { userId: "a", campaignId: "x" },
    { userId: "a", campaignId: "y" },
    { userId: "b", campaignId: "x" },
    { userId: "b", campaignId: "y" },
    { userId: "c", campaignId: "x" },
  ];

  it("returnerer kun sælgere på alle valgte kampagner", () => {
    expect(intersectionUserIdsFromRows(["x", "y"], rows)).toEqual(["a", "b"]);
  });

  it("én kampagne → alle på den", () => {
    expect(intersectionUserIdsFromRows(["x"], rows)).toEqual(["a", "b", "c"]);
  });

  it("tom input → tom", () => {
    expect(intersectionUserIdsFromRows([], rows)).toEqual([]);
  });
});

describe("isDialPoolMode", () => {
  it("kun click-to-call og predictive", () => {
    expect(isDialPoolMode("CLICK_TO_CALL")).toBe(true);
    expect(isDialPoolMode("PREDICTIVE")).toBe(true);
    expect(isDialPoolMode("POWER_DIALER")).toBe(false);
    expect(isDialPoolMode("NO_DIAL")).toBe(false);
  });
});

describe("orderDialPoolRoundRobin", () => {
  it("uden after → samme rækkefølge", () => {
    expect(orderDialPoolRoundRobin(["a", "b", "c"], null)).toEqual(["a", "b", "c"]);
  });

  it("starter efter last campaign", () => {
    expect(orderDialPoolRoundRobin(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    expect(orderDialPoolRoundRobin(["a", "b", "c"], "c")).toEqual(["a", "b", "c"]);
  });

  it("ukendt after → uændret", () => {
    expect(orderDialPoolRoundRobin(["a", "b"], "x")).toEqual(["a", "b"]);
  });
});

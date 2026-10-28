import { describe, expect, it } from "vitest";
import { canEditBlockedTime } from "./blocked-time-auth";

const row = { userId: "victor", createdByUserId: "ernesto" };

describe("canEditBlockedTime", () => {
  it("admin må altid", () => {
    expect(canEditBlockedTime({ user: { id: "x", role: "ADMIN" } }, row)).toBe(true);
  });
  it("ejer og opretter må", () => {
    expect(canEditBlockedTime({ user: { id: "victor", role: "SELLER" } }, row)).toBe(true);
    expect(canEditBlockedTime({ user: { id: "ernesto", role: "SELLER" } }, row)).toBe(true);
  });
  it("andre sælgere må ikke", () => {
    expect(canEditBlockedTime({ user: { id: "mads", role: "SELLER" } }, row)).toBe(false);
  });
});

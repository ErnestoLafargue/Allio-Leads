import { describe, expect, it } from "vitest";
import { resolveMineSalgSalesUserId } from "./mine-salg-view-user";

describe("resolveMineSalgSalesUserId", () => {
  const admin = { sessionUserId: "admin1", sessionRole: "ADMIN" };
  const seller = { sessionUserId: "seller1", sessionRole: "SELLER" };

  it("bruger session-bruger når userId mangler", () => {
    expect(
      resolveMineSalgSalesUserId({
        ...admin,
        requestedUserId: "",
        requestedUserExists: false,
      }),
    ).toEqual({ ok: true, salesUserId: "admin1" });
  });

  it("admin kan se anden bruger", () => {
    expect(
      resolveMineSalgSalesUserId({
        ...admin,
        requestedUserId: "seller2",
        requestedUserExists: true,
      }),
    ).toEqual({ ok: true, salesUserId: "seller2" });
  });

  it("admin får 400 når bruger ikke findes", () => {
    const r = resolveMineSalgSalesUserId({
      ...admin,
      requestedUserId: "missing",
      requestedUserExists: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
    }
  });

  it("sælger kan kun se egen userId i query", () => {
    expect(
      resolveMineSalgSalesUserId({
        ...seller,
        requestedUserId: "seller1",
        requestedUserExists: true,
      }),
    ).toEqual({ ok: true, salesUserId: "seller1" });
  });

  it("sælger får 403 ved andres userId", () => {
    const r = resolveMineSalgSalesUserId({
      ...seller,
      requestedUserId: "seller2",
      requestedUserExists: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.error).toContain("administrator");
    }
  });
});

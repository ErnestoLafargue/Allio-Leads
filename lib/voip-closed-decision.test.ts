import { describe, expect, it } from "vitest";
import { decideClosedNotification, type CallIdentityRef } from "./voip-closed-decision";

const ACTIVE_TIMER_KEY = "live-K1";
const STALE_TIMER_KEY = "stale-K0";

function ref(callObject: unknown, identity: string | null): CallIdentityRef {
  return { callObject, identity };
}

describe("decideClosedNotification — stale CLOSED må ikke fryse det live ur", () => {
  it("matchende identitet: finalize det live ur", () => {
    const liveCall = { tag: "live" };
    const map = new Map([
      ["call-A", ACTIVE_TIMER_KEY],
    ]);
    const result = decideClosedNotification(
      ref(liveCall, "call-A"),
      ref(liveCall, "call-A"),
      map,
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(true);
    expect(result.closedTimerKey).toBe(ACTIVE_TIMER_KEY);
  });

  it("ikke-matchende identitet: ignorér CLOSED, lad det live ur være", () => {
    const liveCall = { tag: "live" };
    const staleCall = { tag: "stale" };
    const map = new Map([
      ["call-A", ACTIVE_TIMER_KEY],
      ["call-B-stale", STALE_TIMER_KEY],
    ]);
    const result = decideClosedNotification(
      ref(staleCall, "call-B-stale"),
      ref(liveCall, "call-A"),
      map,
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(false);
    // closedTimerKey må gerne være sat (det er den stale calls key) — men da
    // isClosingActiveCall er false, skal komponenten alligevel ikke finalize
    // noget. Den vigtige garanti er at vi IKKE returnerer det live opkalds key.
    expect(result.closedTimerKey).not.toBe(ACTIVE_TIMER_KEY);
    expect(result.closedTimerKey).toBe(STALE_TIMER_KEY);
  });

  it("ikke-matchende identitet, ukendt i map: closedTimerKey er null", () => {
    const liveCall = { tag: "live" };
    const staleCall = { tag: "stale" };
    const map = new Map([
      ["call-A", ACTIVE_TIMER_KEY],
    ]);
    const result = decideClosedNotification(
      ref(staleCall, "call-X-unknown"),
      ref(liveCall, "call-A"),
      map,
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(false);
    expect(result.closedTimerKey).toBeNull();
  });

  it("null identitet på begge, men reference-match: fall-back til active timer key", () => {
    const sharedCallObject = { tag: "the-only-call" };
    const result = decideClosedNotification(
      ref(sharedCallObject, null),
      ref(sharedCallObject, null),
      new Map(),
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(true);
    expect(result.closedTimerKey).toBe(ACTIVE_TIMER_KEY);
  });

  it("null identitet på begge, ingen reference-match: ignorér CLOSED", () => {
    const result = decideClosedNotification(
      ref({ tag: "stale" }, null),
      ref({ tag: "live" }, null),
      new Map(),
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(false);
    expect(result.closedTimerKey).toBeNull();
  });

  it("activeCallRef er null (ingen live opkald): CLOSED med kendt identitet er ikke-aktivt", () => {
    const map = new Map([
      ["call-stale", STALE_TIMER_KEY],
    ]);
    const result = decideClosedNotification(
      ref({ tag: "stale" }, "call-stale"),
      null,
      map,
      null,
    );
    expect(result.isClosingActiveCall).toBe(false);
    expect(result.closedTimerKey).toBe(STALE_TIMER_KEY);
  });

  it("reference-match selvom identitet mangler i map: stadig isClosingActiveCall=true", () => {
    const sharedCall = { tag: "live-no-id-yet" };
    const result = decideClosedNotification(
      ref(sharedCall, "call-X"),
      ref(sharedCall, "call-X"),
      new Map(), // identiteten er ikke endnu registreret (race ved tidlig CLOSED)
      ACTIVE_TIMER_KEY,
    );
    expect(result.isClosingActiveCall).toBe(true);
    // Identiteten findes i closed.identity men IKKE i mappen → closedTimerKey = null.
    // Komponenten kan så bruge sin eksisterende fallback (currentCallContext.timerKey).
    expect(result.closedTimerKey).toBeNull();
  });
});

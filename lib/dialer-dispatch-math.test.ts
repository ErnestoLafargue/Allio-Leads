import { describe, expect, it } from "vitest";
import {
  computeDispatchNewCallsNeeded,
  computeDropBrake,
  computePowerDispatchPlan,
  parseTelnyxOutboundChannelLimitFromEnv,
  pickRingingLegsToCancel,
  type PowerDispatchPlanInput,
} from "@/lib/dialer-dispatch-math";

function plan(overrides: Partial<PowerDispatchPlanInput>) {
  return computePowerDispatchPlan({
    readyAgents: 1,
    ratio: 5,
    brakeActive: false,
    maxInFlight: 50,
    unassignedInFlight: 0,
    ringingUnanswered: 0,
    channelLimit: null,
    channelsInUse: 0,
    ...overrides,
  });
}

describe("dialer-dispatch-math", () => {
  it("computeDispatchNewCallsNeeded (predictive): 2 agenter ×5 − 4 in-flight ⇒ 6", () => {
    const { targetTotal, newCallsNeeded } = computeDispatchNewCallsNeeded({
      readyCount: 2,
      ratio: 5,
      inFlightCalls: 4,
      maxNewCallsOverride: null,
      channelLimit: null,
    });
    expect(targetTotal).toBe(10);
    expect(newCallsNeeded).toBe(6);
  });

  it("computeDispatchNewCallsNeeded (predictive): channelLimit begrænser headroom", () => {
    const { newCallsNeeded } = computeDispatchNewCallsNeeded({
      readyCount: 2,
      ratio: 5,
      inFlightCalls: 4,
      maxNewCallsOverride: null,
      channelLimit: 8,
    });
    expect(newCallsNeeded).toBe(4);
  });

  it("parseTelnyxOutboundChannelLimitFromEnv: tom og ugyldig", () => {
    expect(parseTelnyxOutboundChannelLimitFromEnv(undefined)).toBeNull();
    expect(parseTelnyxOutboundChannelLimitFromEnv("0")).toBeNull();
    expect(parseTelnyxOutboundChannelLimitFromEnv("12")).toBe(12);
  });
});

describe("computePowerDispatchPlan", () => {
  it("1 klar sælger × 5 uden noget i luften ⇒ 5 nye", () => {
    const p = plan({});
    expect(p.target).toBe(5);
    expect(p.newCalls).toBe(5);
    expect(p.limitedBy).toBe("none");
  });

  it("trækker igangværende fra: 1 sælger × 5 med 4 i luften ⇒ 1 nyt (ikke 5 nye pr. tick)", () => {
    const p = plan({ unassignedInFlight: 4, ringingUnanswered: 4 });
    expect(p.newCalls).toBe(1);
    expect(p.cancelRinging).toBe(0);
  });

  it("gentagne ticks med fuldt mål ringer ikke flere op", () => {
    const p = plan({ unassignedInFlight: 5, ringingUnanswered: 5 });
    expect(p.newCalls).toBe(0);
    expect(p.limitedBy).toBe("target_reached");
  });

  it("ingen klar sælger ⇒ ingen nye, og ringende overskud lægges på", () => {
    const p = plan({ readyAgents: 0, unassignedInFlight: 3, ringingUnanswered: 2 });
    expect(p.newCalls).toBe(0);
    expect(p.limitedBy).toBe("no_ready_agents");
    expect(p.cancelRinging).toBe(2);
  });

  it("sælger forbundet (ready 2→1): kun overskuddet over målet lægges på", () => {
    const p = plan({ readyAgents: 1, ratio: 3, unassignedInFlight: 5, ringingUnanswered: 4 });
    expect(p.target).toBe(3);
    expect(p.cancelRinging).toBe(2);
    expect(p.newCalls).toBe(0);
  });

  it("besvarede opkald (AMD kører) lægges ikke på — kun ringende", () => {
    const p = plan({ readyAgents: 0, unassignedInFlight: 3, ringingUnanswered: 0 });
    expect(p.cancelRinging).toBe(0);
  });

  it("kampagneloft (maks. in-flight) klipper målet", () => {
    const p = plan({ readyAgents: 5, ratio: 5, maxInFlight: 12 });
    expect(p.target).toBe(12);
    expect(p.newCalls).toBe(12);
    const full = plan({ readyAgents: 5, ratio: 5, maxInFlight: 12, unassignedInFlight: 12, ringingUnanswered: 12 });
    expect(full.newCalls).toBe(0);
    expect(full.limitedBy).toBe("max_in_flight");
  });

  it("kanalgrænse: 5 sælgere × 3 med 8 kanaler og 2 i samtale ⇒ 6 nye", () => {
    const p = plan({ readyAgents: 5, ratio: 3, channelLimit: 8, channelsInUse: 2 });
    expect(p.target).toBe(15);
    expect(p.newCalls).toBe(6);
    expect(p.limitedBy).toBe("channel_limit");
  });

  it("kanalgrænse nået ⇒ ingen nye", () => {
    const p = plan({ readyAgents: 2, ratio: 3, channelLimit: 8, channelsInUse: 8 });
    expect(p.newCalls).toBe(0);
    expect(p.limitedBy).toBe("channel_limit");
  });

  it("drop-bremse ⇒ én linje pr. klar sælger", () => {
    const p = plan({ readyAgents: 3, ratio: 5, brakeActive: true });
    expect(p.effectiveRatio).toBe(1);
    expect(p.target).toBe(3);
  });

  it("brøk-ratio rundes ned pr. samlet antal (2 × 1,5 = 3, 3 × 1,5 = 4)", () => {
    expect(plan({ readyAgents: 2, ratio: 1.5 }).target).toBe(3);
    expect(plan({ readyAgents: 3, ratio: 1.5 }).target).toBe(4);
  });

  it("5 sælgere på samme kampagne: 3 i samtale, 2 klar × 3 ⇒ mål 6", () => {
    const p = plan({ readyAgents: 2, ratio: 3, channelLimit: 20, channelsInUse: 3 });
    expect(p.target).toBe(6);
    expect(p.newCalls).toBe(6);
  });
});

describe("computeDropBrake", () => {
  it("slået fra ved 0 %", () => {
    expect(computeDropBrake({ bridges: 0, drops: 20, maxDropRatePct: 0, minSample: 10 }).active).toBe(false);
  });

  it("for lille stikprøve bremser ikke", () => {
    const b = computeDropBrake({ bridges: 3, drops: 2, maxDropRatePct: 3, minSample: 10 });
    expect(b.active).toBe(false);
    expect(b.dropRate).toBeCloseTo(0.4);
  });

  it("over loftet med nok data bremser", () => {
    const b = computeDropBrake({ bridges: 18, drops: 2, maxDropRatePct: 3, minSample: 10 });
    expect(b.active).toBe(true);
    expect(b.sample).toBe(20);
  });

  it("under loftet bremser ikke", () => {
    expect(computeDropBrake({ bridges: 99, drops: 1, maxDropRatePct: 3, minSample: 10 }).active).toBe(false);
  });
});

describe("pickRingingLegsToCancel", () => {
  it("vælger de ældste først", () => {
    const legs = [
      { id: "c", reservedAt: new Date("2026-09-24T10:00:30Z") },
      { id: "a", reservedAt: new Date("2026-09-24T10:00:00Z") },
      { id: "b", reservedAt: new Date("2026-09-24T10:00:10Z") },
    ];
    expect(pickRingingLegsToCancel(legs, 2).map((l) => l.id)).toEqual(["a", "b"]);
    expect(pickRingingLegsToCancel(legs, 0)).toEqual([]);
  });
});

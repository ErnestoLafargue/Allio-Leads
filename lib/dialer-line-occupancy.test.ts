import { describe, expect, it } from "vitest";
import {
  applyOccupancyCredit,
  linePhaseFromAgentStatus,
  linePhaseFromVoipStatus,
  occupancyDeltaSeconds,
} from "./dialer-line-phase";

const t0 = new Date("2026-09-24T08:00:00.000Z");
const t15 = new Date("2026-09-24T08:00:15.000Z");
const t40min = new Date("2026-09-24T08:40:00.000Z");

describe("occupancyDeltaSeconds", () => {
  it("0 uden forrige tidspunkt", () => {
    expect(occupancyDeltaSeconds(null, t15)).toBe(0);
  });

  it("sekunder mellem ticks", () => {
    expect(occupancyDeltaSeconds(t0, t15)).toBe(15);
  });

  it("capper lange huller", () => {
    expect(occupancyDeltaSeconds(t0, t40min, 60)).toBe(60);
  });
});

describe("applyOccupancyCredit", () => {
  it("krediterer ring og skifter til tale", () => {
    const next = applyOccupancyCredit({
      ringSeconds: 10,
      talkLineSeconds: 0,
      linePhase: "ringing",
      lineLastSeenAt: t0,
      nextPhase: "talking",
      now: t15,
    });
    expect(next.ringSeconds).toBe(25);
    expect(next.talkLineSeconds).toBe(0);
    expect(next.linePhase).toBe("talking");
  });

  it("krediterer tale og lukker linjen", () => {
    const next = applyOccupancyCredit({
      ringSeconds: 25,
      talkLineSeconds: 4,
      linePhase: "talking",
      lineLastSeenAt: t0,
      nextPhase: null,
      now: t15,
    });
    expect(next.ringSeconds).toBe(25);
    expect(next.talkLineSeconds).toBe(19);
    expect(next.linePhase).toBeNull();
  });

  it("første tick i en fase giver 0 (ingen lastSeen)", () => {
    const next = applyOccupancyCredit({
      ringSeconds: 0,
      talkLineSeconds: 0,
      linePhase: null,
      lineLastSeenAt: null,
      nextPhase: "ringing",
      now: t0,
    });
    expect(next.ringSeconds).toBe(0);
    expect(next.linePhase).toBe("ringing");
  });
});

describe("linePhaseFrom*", () => {
  it("agent-status", () => {
    expect(linePhaseFromAgentStatus("ringing")).toBe("ringing");
    expect(linePhaseFromAgentStatus("talking")).toBe("talking");
    expect(linePhaseFromAgentStatus("wrap_up")).toBeNull();
    expect(linePhaseFromAgentStatus("ready")).toBeNull();
  });

  it("voip-status", () => {
    expect(linePhaseFromVoipStatus("live")).toBe("talking");
    expect(linePhaseFromVoipStatus("connecting")).toBe("ringing");
    expect(linePhaseFromVoipStatus("ringing")).toBe("ringing");
    expect(linePhaseFromVoipStatus("idle")).toBeNull();
  });
});

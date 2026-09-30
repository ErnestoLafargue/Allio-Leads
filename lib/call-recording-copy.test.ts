import { describe, expect, it } from "vitest";
import { planRecordingCopy, type CopySourceRecording } from "./call-recording-copy";

const rec = (over: Partial<CopySourceRecording>): CopySourceRecording => ({
  id: "src1",
  telnyxRecordingId: "tx1",
  pipelineStatus: "ANALYZED",
  pipelineError: null,
  agentUserId: "u1",
  leadId: "l1",
  campaignId: "c1",
  ...over,
});

const existing = { userIds: new Set(["u1"]), leadIds: new Set(["l1"]), campaignIds: new Set(["c1"]) };

describe("planRecordingCopy", () => {
  it("opretter nye rækker og nulstiller fremmednøgler, der mangler i målet", () => {
    const plan = planRecordingCopy([rec({ leadId: "slettet" })], [], existing);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].leadId).toBeNull();
    expect(plan.create[0].agentUserId).toBe("u1");
    expect(plan.nulled).toEqual({ agent: 0, lead: 1, campaign: 0 });
    expect(plan.carry.get("src1")).toBe("src1");
  });

  it("bruger målets id og løfter status, når målet kun har importeret optagelsen", () => {
    const plan = planRecordingCopy(
      [rec({})],
      [{ id: "prod1", telnyxRecordingId: "tx1", pipelineStatus: "NEW", hasTranscript: false }],
      existing,
    );
    expect(plan.create).toHaveLength(0);
    expect(plan.carry.get("src1")).toBe("prod1");
    expect(plan.statusUpdates.get("ANALYZED")).toEqual(["tx1"]);
  });

  it("springer optagelser over, som målet allerede har transskriberet", () => {
    const plan = planRecordingCopy(
      [rec({})],
      [{ id: "prod1", telnyxRecordingId: "tx1", pipelineStatus: "TRANSCRIBED", hasTranscript: true }],
      existing,
    );
    expect(plan.skipped).toBe(1);
    expect(plan.carry.size).toBe(0);
    expect(plan.statusUpdates.size).toBe(0);
  });

  it("fører ikke fejlstatus med over", () => {
    const plan = planRecordingCopy([rec({ pipelineStatus: "FAILED", pipelineError: "timeout" })], [], existing);
    expect(plan.create[0].pipelineStatus).toBe("NEW");
    expect(plan.create[0].pipelineError).toBeNull();
  });
});

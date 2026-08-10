import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MEETING_OUTCOME_LOST,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import {
  clampReconcileLimit,
  prioritizePendingFirst,
  reconcilePodioMeetingOutcomesBatch,
} from "@/lib/podio/reconcile-outcomes";

describe("clampReconcileLimit", () => {
  it("defaults and clamps", () => {
    expect(clampReconcileLimit(undefined)).toBe(50);
    expect(clampReconcileLimit(0)).toBe(1);
    expect(clampReconcileLimit(200)).toBe(100);
    expect(clampReconcileLimit(25.7)).toBe(25);
  });
});

describe("prioritizePendingFirst", () => {
  it("puts PENDING and empty before other outcomes", () => {
    const ordered = prioritizePendingFirst([
      { id: "a", podioItemId: "1", meetingOutcomeStatus: MEETING_OUTCOME_SALE },
      { id: "b", podioItemId: "2", meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
      { id: "c", podioItemId: "3", meetingOutcomeStatus: MEETING_OUTCOME_LOST },
      { id: "d", podioItemId: "4", meetingOutcomeStatus: "" },
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("reconcilePodioMeetingOutcomesBatch", () => {
  const applyUpdate = vi.fn();
  const sleepFn = vi.fn(async () => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts updated, noop, ignored and errors", async () => {
    const findCandidates = vi.fn(async () => [
      { id: "p1", podioItemId: "101", meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
      { id: "s1", podioItemId: "102", meetingOutcomeStatus: MEETING_OUTCOME_SALE },
      { id: "bad", podioItemId: "not-a-number", meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
      { id: "err", podioItemId: "103", meetingOutcomeStatus: MEETING_OUTCOME_LOST },
    ]);

    applyUpdate
      .mockResolvedValueOnce({ ok: true as const, action: "underBehandling" })
      .mockResolvedValueOnce({ ok: true as const, action: "noop" })
      .mockRejectedValueOnce(new Error("podio down"));

    const result = await reconcilePodioMeetingOutcomesBatch({
      limit: 50,
      findCandidates,
      applyUpdate,
      pauseMs: 1,
      sleepFn,
    });

    expect(result.checked).toBe(3);
    expect(result.updated).toBe(1);
    expect(result.noop).toBe(1);
    expect(result.ignored).toBe(0);
    expect(result.errors).toEqual([
      { leadId: "bad", error: "invalid podioItemId" },
      { leadId: "err", itemId: 103, error: "podio down" },
    ]);
    expect(applyUpdate).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalled();
  });

  it("counts ignored separately from noop", async () => {
    const findCandidates = vi.fn(async () => [
      { id: "x", podioItemId: "9", meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
    ]);
    applyUpdate.mockResolvedValueOnce({ ok: true as const, ignored: "no lead", action: undefined });

    const result = await reconcilePodioMeetingOutcomesBatch({
      findCandidates,
      applyUpdate,
      pauseMs: 0,
      sleepFn,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, noop: 0, ignored: 1 });
  });

  it("processes PENDING candidates before others from findCandidates order", async () => {
    const findCandidates = vi.fn(async () => [
      { id: "sale", podioItemId: "1", meetingOutcomeStatus: MEETING_OUTCOME_SALE },
      { id: "pending", podioItemId: "2", meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
    ]);
    applyUpdate.mockResolvedValue({ ok: true as const, action: "noop" });

    await reconcilePodioMeetingOutcomesBatch({
      findCandidates,
      applyUpdate,
      pauseMs: 0,
      sleepFn,
    });

    expect(applyUpdate.mock.calls.map((c) => c[0])).toEqual([2, 1]);
  });
});

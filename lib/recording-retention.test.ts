import { describe, expect, it } from "vitest";
import { RECORDING_RETENTION_MONTHS, recordingRetentionCutoff } from "./recording-retention";

describe("recording retention", () => {
  it("er 12 måneder som standard", () => {
    expect(RECORDING_RETENTION_MONTHS).toBe(12);
  });

  it("cut-off er 12 måneder før nu", () => {
    const cutoff = recordingRetentionCutoff(new Date("2026-10-12T12:00:00.000Z"));
    expect(cutoff.toISOString()).toBe("2025-10-12T12:00:00.000Z");
  });
});

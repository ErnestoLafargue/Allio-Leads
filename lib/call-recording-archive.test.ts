import { describe, expect, it } from "vitest";
import {
  ARCHIVE_MIN_SECONDS,
  archiveBlobPath,
  shouldArchiveRecording,
  sortOldestFirst,
} from "@/lib/call-recording-archive";

describe("shouldArchiveRecording", () => {
  it("arkiverer fra 20 sekunder", () => {
    expect(ARCHIVE_MIN_SECONDS).toBe(20);
    expect(shouldArchiveRecording({ durationMillis: 19_400 })).toBe(false);
    expect(shouldArchiveRecording({ durationMillis: 19_600 })).toBe(true);
    expect(shouldArchiveRecording({ durationMillis: 1_045_333 })).toBe(true);
  });

  it("springer optagelser uden varighed over", () => {
    expect(shouldArchiveRecording({ durationMillis: null })).toBe(false);
  });
});

describe("sortOldestFirst", () => {
  it("tager de ældste (tættest på at forsvinde hos Telnyx) først", () => {
    const recs = [
      { id: "b", startedAt: new Date("2026-10-20T10:00:00Z") },
      { id: "a", startedAt: new Date("2026-10-16T07:40:00Z") },
      { id: "c", startedAt: new Date("2026-10-29T11:00:00Z") },
    ];
    expect(sortOldestFirst(recs).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("archiveBlobPath", () => {
  it("giver en fast sti pr. optagelse og måned", () => {
    expect(
      archiveBlobPath({ id: "27f2c903-aa1b-4c2d", startedAt: new Date("2026-10-29T10:51:28Z") }),
    ).toBe("call-recordings/archive/2026-10/27f2c903-aa1b-4c2d.mp3");
  });
});

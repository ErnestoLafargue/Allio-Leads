import { describe, expect, it } from "vitest";
import { supportsMonoPlayback } from "./mono-playback";

describe("supportsMonoPlayback", () => {
  it("tillader same-origin stier så Web Audio kan mixe sporene", () => {
    expect(supportsMonoPlayback("/api/leads/call-recordings/abc/audio")).toBe(true);
    expect(supportsMonoPlayback("/api/call-recordings/abc/audio")).toBe(true);
  });

  it("tillader Vercel Blob (CORS *)", () => {
    expect(
      supportsMonoPlayback("https://abc.blob.vercel-storage.com/call-recordings/lead-1.mp3"),
    ).toBe(true);
  });

  it("afviser protocol-relative og fremmede hosts", () => {
    expect(supportsMonoPlayback("//cdn.example.com/a.mp3")).toBe(false);
    expect(supportsMonoPlayback("https://s3.amazonaws.com/rec.mp3")).toBe(false);
  });
});

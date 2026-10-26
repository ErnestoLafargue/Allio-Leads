import { describe, expect, it } from "vitest";
import { playbackSourceForRecording, supportsMonoPlayback } from "./mono-playback";

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

describe("playbackSourceForRecording", () => {
  it("afspiller Blob-kopien direkte, også når der findes et event-id", () => {
    const blob = "https://abc.public.blob.vercel-storage.com/call-recordings/lead-1.mp3";
    expect(playbackSourceForRecording(blob, "evt_1")).toBe(blob);
  });

  it("sender Telnyx-links gennem proxyen så en udløbet URL kan genhentes", () => {
    expect(
      playbackSourceForRecording("https://s3.amazonaws.com/rec.mp3?Expires=600", "evt_1"),
    ).toBe("/api/leads/call-recordings/evt_1/audio");
  });
});

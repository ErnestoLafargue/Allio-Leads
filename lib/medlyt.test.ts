import { describe, expect, it } from "vitest";
import { medlytButtonTone } from "@/lib/medlyt";
import { normalizeMedlytSdp } from "@/lib/medlyt-webrtc";

describe("medlytButtonTone", () => {
  it("green when talking", () => {
    expect(medlytButtonTone("talking")).toBe("green");
  });
  it("blue when ringing", () => {
    expect(medlytButtonTone("ringing")).toBe("blue");
  });
  it("ready when på kampagne uden opkald", () => {
    expect(medlytButtonTone("ready")).toBe("ready");
    expect(medlytButtonTone("paused")).toBe("ready");
    expect(medlytButtonTone("wrap_up")).toBe("ready");
    expect(medlytButtonTone("draining")).toBe("ready");
  });
  it("disabled when ikke i dialer", () => {
    expect(medlytButtonTone("offline")).toBe("disabled");
  });
});

describe("normalizeMedlytSdp", () => {
  it("tilføjer CRLF efter sidste linje (Chrome kræver det)", () => {
    const raw =
      "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\na=rtpmap:126 telephone-event/8000";
    const out = normalizeMedlytSdp(raw);
    expect(out.endsWith("\r\n")).toBe(true);
    expect(out).toContain("a=rtpmap:126 telephone-event/8000\r\n");
  });
});

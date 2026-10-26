import { describe, expect, it } from "vitest";
import { medlytButtonTone } from "@/lib/medlyt";
import { applyMedlytLowDelaySdp, normalizeMedlytSdp } from "@/lib/medlyt-webrtc";

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

describe("applyMedlytLowDelaySdp", () => {
  it("sætter 10 ms ptime og slår Opus-FEC fra", () => {
    const raw = [
      "v=0",
      "m=audio 9 UDP/TLS/RTP/SAVPF 111 126",
      "a=rtpmap:111 opus/48000/2",
      "a=fmtp:111 minptime=10;useinbandfec=1",
      "a=rtpmap:126 telephone-event/8000",
    ].join("\r\n");
    const out = applyMedlytLowDelaySdp(raw);
    expect(out).toContain("a=fmtp:111 minptime=10;useinbandfec=0;usedtx=0");
    expect(out).toContain("a=ptime:10");
    expect(out).toContain("a=maxptime:10");
    expect(out).not.toContain("useinbandfec=1");
    expect(out.endsWith("\r\n")).toBe(true);
  });
});

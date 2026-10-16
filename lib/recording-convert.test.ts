import { describe, expect, it } from "vitest";
import { mp3Version } from "./recording-convert";

describe("mp3Version", () => {
  it("læser MPEG-versionen efter ID3-headeren", () => {
    const id3 = [0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 2, 0, 0];
    expect(mp3Version(Uint8Array.from([...id3, 0xff, 0xe2, 0x10]))).toBe("2.5"); // Telnyx
    expect(mp3Version(Uint8Array.from([0xff, 0xfb, 0x90]))).toBe("1");
    expect(mp3Version(Uint8Array.from([0xff, 0xf3, 0x90]))).toBe("2");
    expect(mp3Version(Uint8Array.from([1, 2, 3]))).toBeNull();
  });
});

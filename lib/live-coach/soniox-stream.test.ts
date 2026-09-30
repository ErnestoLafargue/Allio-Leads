import { describe, expect, it } from "vitest";
import { SpeakerTranscript } from "./soniox-stream";

describe("SpeakerTranscript", () => {
  it("samler endelige og foreløbige ord og afslutter ytringen ved <end>", () => {
    const t = new SpeakerTranscript();
    expect(t.apply([{ text: "Vi har", is_final: true, end_ms: 400 }, { text: " allerede", is_final: false, end_ms: 700 }])).toBeNull();
    expect(t.utterance).toBe("Vi har allerede");
    expect(t.lastEndMs).toBe(700);
    expect(t.apply([{ text: " allerede et system.", is_final: true, end_ms: 1400 }, { text: "<end>", is_final: true }])).toBe(
      "Vi har allerede et system.",
    );
    expect(t.utterance).toBe("");
    t.apply([{ text: " Hvad koster", is_final: false }]);
    expect(t.utterance).toBe("Hvad koster");
  });
});

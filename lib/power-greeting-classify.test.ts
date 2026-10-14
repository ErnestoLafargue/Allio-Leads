import { describe, expect, it } from "vitest";
import {
  classifyPowerGreeting,
  extractTelnyxTranscriptConfidence,
  extractTelnyxTranscriptText,
  mergeGreetingHint,
} from "@/lib/power-greeting-classify";
import { decidePowerGreetingAction } from "@/lib/power-greeting-decision";

describe("classifyPowerGreeting", () => {
  it("kender danske telefonsvarer-fraser", () => {
    expect(classifyPowerGreeting("Du har ramt Hos Katherina")).toBe("voicemail");
    expect(classifyPowerGreeting("Hej du har prøvet at ringe til Anna")).toBe("voicemail");
    expect(classifyPowerGreeting("Læg venligst en besked efter tonen")).toBe("voicemail");
    expect(classifyPowerGreeting("Please leave a message after the tone")).toBe("voicemail");
    expect(classifyPowerGreeting("This is the voicemail of Peter")).toBe("voicemail");
  });

  it("kender et menneske der tager den", () => {
    expect(classifyPowerGreeting("Hallo?")).toBe("human");
    expect(classifyPowerGreeting("hej det er Anna fra klinikken")).toBe("human");
    expect(classifyPowerGreeting("Hallo det er Jens")).toBe("human");
    expect(classifyPowerGreeting("Goddag")).toBe("human");
  });

  it("er usikker på støj, korte fragmenter og et bart hej (telefonsvarer starter ofte med hej)", () => {
    expect(classifyPowerGreeting("")).toBe("uncertain");
    expect(classifyPowerGreeting("øh")).toBe("uncertain");
    expect(classifyPowerGreeting("mm")).toBe("uncertain");
    expect(classifyPowerGreeting("hej")).toBe("uncertain");
    expect(classifyPowerGreeting("hi")).toBe("uncertain");
  });

  it("stoler ikke på svag voicemail-transskription", () => {
    expect(classifyPowerGreeting("Læg venligst en besked efter tonen", 0.4)).toBe("uncertain");
    expect(classifyPowerGreeting("Læg venligst en besked efter tonen", 0.9)).toBe("voicemail");
  });
});

describe("mergeGreetingHint", () => {
  it("menneske vinder over telefonsvarer", () => {
    expect(mergeGreetingHint("voicemail", "human")).toBe("human");
  });
  it("usikkerhed overskriver ikke et sikkert hint", () => {
    expect(mergeGreetingHint("human", "uncertain")).toBe("human");
    expect(mergeGreetingHint("voicemail", "uncertain")).toBe("voicemail");
  });
});

describe("decidePowerGreetingAction", () => {
  it("Soniox-menneske forbinder med det samme — venter ikke på AMD", () => {
    expect(decidePowerGreetingAction({ amd: null, greeting: "human", timedOut: false })).toBe("CONNECT");
  });

  it("Soniox-voicemail lægges på når AMD ikke modsiger", () => {
    expect(decidePowerGreetingAction({ amd: null, greeting: "voicemail", timedOut: false })).toBe(
      "VOICEMAIL",
    );
    expect(decidePowerGreetingAction({ amd: "machine", greeting: "voicemail", timedOut: false })).toBe(
      "VOICEMAIL",
    );
  });

  it("uenige systemer (AMD human + Soniox voicemail) går til sælger", () => {
    expect(decidePowerGreetingAction({ amd: "human", greeting: "voicemail", timedOut: false })).toBe(
      "CONNECT",
    );
  });

  it("AMD-maskine venter kort på Soniox, så den ikke hænger et menneske af", () => {
    expect(decidePowerGreetingAction({ amd: "machine", greeting: null, timedOut: false })).toBe("WAIT");
    expect(decidePowerGreetingAction({ amd: "machine", greeting: "human", timedOut: false })).toBe("CONNECT");
    expect(decidePowerGreetingAction({ amd: "machine", greeting: null, timedOut: true })).toBe("VOICEMAIL");
  });

  it("usikkerhed går ALTID til sælger når tiden er gået", () => {
    expect(decidePowerGreetingAction({ amd: "unknown", greeting: "uncertain", timedOut: true })).toBe(
      "CONNECT",
    );
    expect(decidePowerGreetingAction({ amd: null, greeting: null, timedOut: true })).toBe("CONNECT");
    expect(decidePowerGreetingAction({ amd: "unknown", greeting: null, timedOut: false })).toBe("WAIT");
  });

  it("AMD-human forbinder straks uden Soniox-tekst", () => {
    expect(decidePowerGreetingAction({ amd: "human", greeting: null, timedOut: false })).toBe("CONNECT");
  });
});

describe("extractTelnyxTranscriptText", () => {
  it("læser Telnyx transcription_data.transcript", () => {
    expect(
      extractTelnyxTranscriptText({
        transcription_data: { transcript: "Hallo det er Jens", confidence: 0.91, is_final: true },
      }),
    ).toBe("Hallo det er Jens");
    expect(
      extractTelnyxTranscriptConfidence({
        transcription_data: { transcript: "Hallo", confidence: 0.91 },
      }),
    ).toBe(0.91);
  });
});

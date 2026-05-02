import { describe, expect, it } from "vitest";
import {
  describeVoipCallFailureForUi,
  detectPredictiveOutcomeFromCall,
  type VoipCallFailureMeta,
} from "./voip-call-messages";

function meta(overrides: Partial<VoipCallFailureMeta> = {}): VoipCallFailureMeta {
  return {
    hadLive: false,
    sipCode: 0,
    cause: "",
    sipReason: "",
    ...overrides,
  };
}

describe("detectPredictiveOutcomeFromCall — forkert nummer må ALDRIG blive NOT_INTERESTED", () => {
  it("Telnyx UNALLOCATED_NUMBER (sipCode 404) → NOT_HOME (ikke NOT_INTERESTED)", () => {
    const result = detectPredictiveOutcomeFromCall(
      meta({ sipCode: 404, cause: "UNALLOCATED_NUMBER", sipReason: "Not Found" }),
    );
    expect(result).toBe("NOT_HOME");
    expect(result).not.toBe("NOT_INTERESTED");
  });

  it("Telnyx D11 'Invalid destination number' → NOT_HOME", () => {
    const result = detectPredictiveOutcomeFromCall(
      meta({
        sipCode: 404,
        cause: "UNALLOCATED_NUMBER",
        sipReason: "Invalid destination number D11",
      }),
    );
    expect(result).toBe("NOT_HOME");
    expect(result).not.toBe("NOT_INTERESTED");
  });

  it("SIP 484 (Address Incomplete) → NOT_HOME", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 484 }))).toBe("NOT_HOME");
  });

  it("cause-streng indeholder 'invalid number' uden 404 → NOT_HOME", () => {
    expect(
      detectPredictiveOutcomeFromCall(meta({ sipCode: 0, cause: "invalid number" })),
    ).toBe("NOT_HOME");
  });

  it("cause-streng indeholder 'unallocated' uden 404 → NOT_HOME", () => {
    expect(
      detectPredictiveOutcomeFromCall(meta({ sipCode: 0, sipReason: "Unallocated" })),
    ).toBe("NOT_HOME");
  });
});

describe("detectPredictiveOutcomeFromCall — voicemail vinder ALTID hvis Telnyx kan se det", () => {
  it("voicemail-hint vinder over 404/forkert nummer", () => {
    expect(
      detectPredictiveOutcomeFromCall(
        meta({ sipCode: 404, cause: "UNALLOCATED_NUMBER", sipReason: "Voicemail Active" }),
      ),
    ).toBe("VOICEMAIL");
  });

  it("voicemail-hint vinder over optaget (busy)", () => {
    expect(
      detectPredictiveOutcomeFromCall(
        meta({ sipCode: 486, cause: "USER_BUSY", sipReason: "voicemail" }),
      ),
    ).toBe("VOICEMAIL");
  });

  it("voicemail-hint vinder over no-answer", () => {
    expect(
      detectPredictiveOutcomeFromCall(
        meta({ sipCode: 408, cause: "machine_detected" }),
      ),
    ).toBe("VOICEMAIL");
  });

  it("voicemail-hint vinder over hadLive=true (Telnyx siger at den anden ende er en svaremaskine)", () => {
    expect(
      detectPredictiveOutcomeFromCall(
        meta({ hadLive: true, sipCode: 200, cause: "NORMAL_CLEARING", sipReason: "Voicemail" }),
      ),
    ).toBe("VOICEMAIL");
    expect(
      detectPredictiveOutcomeFromCall(
        meta({ hadLive: true, cause: "machine_detection_completed" }),
      ),
    ).toBe("VOICEMAIL");
  });

  it("ekstra voicemail-keywords (machine greeting, AMD result, fax) → VOICEMAIL", () => {
    expect(
      detectPredictiveOutcomeFromCall(meta({ cause: "machine_greeting_ended" })),
    ).toBe("VOICEMAIL");
    expect(detectPredictiveOutcomeFromCall(meta({ sipReason: "amd_machine" }))).toBe(
      "VOICEMAIL",
    );
    expect(detectPredictiveOutcomeFromCall(meta({ cause: "amd_result=machine" }))).toBe(
      "VOICEMAIL",
    );
    expect(detectPredictiveOutcomeFromCall(meta({ sipReason: "fax_detected" }))).toBe(
      "VOICEMAIL",
    );
  });
});

describe("detectPredictiveOutcomeFromCall — øvrige cases bevares", () => {
  it("hadLive=true uden voicemail-hint → returnerer null (agenten har talt med nogen)", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ hadLive: true, sipCode: 404 }))).toBeNull();
    expect(
      detectPredictiveOutcomeFromCall(meta({ hadLive: true, sipCode: 200, cause: "NORMAL_CLEARING" })),
    ).toBeNull();
  });

  it("voicemail-detection → VOICEMAIL", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ cause: "machine_detected" }))).toBe(
      "VOICEMAIL",
    );
    expect(detectPredictiveOutcomeFromCall(meta({ sipReason: "voicemail beep detected" }))).toBe(
      "VOICEMAIL",
    );
  });

  it("optaget (SIP 486 / busy) → NOT_HOME", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 486 }))).toBe("NOT_HOME");
    expect(detectPredictiveOutcomeFromCall(meta({ cause: "user busy" }))).toBe("NOT_HOME");
  });

  it("ingen svar (SIP 408/480/410) → NOT_HOME", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 408 }))).toBe("NOT_HOME");
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 480 }))).toBe("NOT_HOME");
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 410 }))).toBe("NOT_HOME");
  });

  it("ingen klassificerbar fejl → null (agenten må selv vælge)", () => {
    expect(detectPredictiveOutcomeFromCall(meta({ sipCode: 500 }))).toBeNull();
    expect(detectPredictiveOutcomeFromCall(meta({}))).toBeNull();
  });
});

describe("describeVoipCallFailureForUi — agent-toast viser stadig 'Nummeret er forkert'", () => {
  it("Toast-tekst er uændret for forkert nummer (404)", () => {
    const desc = describeVoipCallFailureForUi(
      meta({ sipCode: 404, cause: "UNALLOCATED_NUMBER", sipReason: "Not Found" }),
    );
    expect(desc?.userText).toBe("Nummeret er forkert");
  });
});

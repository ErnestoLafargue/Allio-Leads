import { describe, expect, it } from "vitest";
import {
  isPowerDialerDefiniteVoicemail,
  isPowerDialerUncertain,
  mapTelnyxAmdResult,
  shouldBridgeToAgent,
  shouldMarkVoicemail,
} from "./telnyx-amd-result";

describe("mapTelnyxAmdResult — premium AMD-result-værdier", () => {
  it("human-værdier (alle premium-varianter) → 'human'", () => {
    expect(mapTelnyxAmdResult("human")).toBe("human");
    expect(mapTelnyxAmdResult("human_residence")).toBe("human");
    expect(mapTelnyxAmdResult("human_business")).toBe("human");
    // Case-insensitivt
    expect(mapTelnyxAmdResult("HUMAN")).toBe("human");
    expect(mapTelnyxAmdResult("Human_Residence")).toBe("human");
  });

  it("'machine' → 'machine' (svaremaskine = voicemail)", () => {
    expect(mapTelnyxAmdResult("machine")).toBe("machine");
    expect(mapTelnyxAmdResult("MACHINE")).toBe("machine");
  });

  it("fax-varianter → 'fax' (også voicemail i vores model)", () => {
    expect(mapTelnyxAmdResult("fax")).toBe("fax");
    expect(mapTelnyxAmdResult("fax_detected")).toBe("fax");
    expect(mapTelnyxAmdResult("FAX_DETECTED")).toBe("fax");
  });

  it("greeting/beep-events (kommer KUN efter machine konklusion) → 'machine'", () => {
    expect(mapTelnyxAmdResult("beep_detected")).toBe("machine");
    expect(mapTelnyxAmdResult("no_beep_detected")).toBe("machine");
    expect(mapTelnyxAmdResult("ended")).toBe("machine");
  });

  it("usikre/ukendte resultater → 'unknown' (vi bridger for ikke at miste lead)", () => {
    expect(mapTelnyxAmdResult("not_sure")).toBe("unknown");
    expect(mapTelnyxAmdResult("silence")).toBe("unknown");
    expect(mapTelnyxAmdResult("")).toBe("unknown");
    expect(mapTelnyxAmdResult(null)).toBe("unknown");
    expect(mapTelnyxAmdResult(undefined)).toBe("unknown");
    expect(mapTelnyxAmdResult("totally_random_value")).toBe("unknown");
  });

  it("trimmer whitespace", () => {
    expect(mapTelnyxAmdResult("  machine  ")).toBe("machine");
    expect(mapTelnyxAmdResult("\thuman_residence\n")).toBe("human");
  });
});

describe("shouldMarkVoicemail — afgør om lead skal sættes til VOICEMAIL", () => {
  it("'machine' og 'fax' → VOICEMAIL (kerne-bug-fix: AMD machine MÅ ikke ende som NOT_HOME)", () => {
    expect(shouldMarkVoicemail("machine")).toBe(true);
    expect(shouldMarkVoicemail("fax")).toBe(true);
  });

  it("'human' og 'unknown' → ingen voicemail-markering", () => {
    expect(shouldMarkVoicemail("human")).toBe(false);
    expect(shouldMarkVoicemail("unknown")).toBe(false);
  });
});

describe("shouldBridgeToAgent — afgør om vi skal bridge til ledig agent", () => {
  it("'human' og 'unknown' → bridge (vi mister hellere ikke et menneske ved usikkerhed)", () => {
    expect(shouldBridgeToAgent("human")).toBe(true);
    expect(shouldBridgeToAgent("unknown")).toBe(true);
  });

  it("'machine' og 'fax' → ingen bridge (det er voicemail)", () => {
    expect(shouldBridgeToAgent("machine")).toBe(false);
    expect(shouldBridgeToAgent("fax")).toBe(false);
  });
});

describe("Power Dialer: isPowerDialerDefiniteVoicemail / isPowerDialerUncertain", () => {
  it("maskine og fax er definitive voicemail", () => {
    expect(isPowerDialerDefiniteVoicemail("machine")).toBe(true);
    expect(isPowerDialerDefiniteVoicemail("fax")).toBe(true);
    expect(isPowerDialerDefiniteVoicemail("human")).toBe(false);
    expect(isPowerDialerDefiniteVoicemail("unknown")).toBe(false);
  });

  it("kun unknown er usikker (requeue i Power — ikke bridge)", () => {
    expect(isPowerDialerUncertain("unknown")).toBe(true);
    expect(isPowerDialerUncertain("human")).toBe(false);
    expect(isPowerDialerUncertain(mapTelnyxAmdResult("not_sure"))).toBe(true);
  });
});

describe("Invariant: AMD-result fører ALTID enten til VOICEMAIL eller bridge — aldrig begge", () => {
  it("alle 4 interne kategorier er gensidigt eksklusive", () => {
    const cats = ["human", "machine", "fax", "unknown"] as const;
    for (const c of cats) {
      const a = shouldMarkVoicemail(c);
      const b = shouldBridgeToAgent(c);
      // Enten/eller — aldrig begge sande, aldrig begge falske
      expect(a !== b).toBe(true);
    }
  });
});

describe("Regression: AMD machine-result fører til VOICEMAIL (ikke NOT_HOME)", () => {
  // Dette er den primære bug-fix-invariant: når Telnyx AMD detekterer voicemail
  // skal lead.status sættes til VOICEMAIL via handleAmdMachine — IKKE NOT_HOME
  // via WebRTC's 25-sek client-side timeout.
  it("Premium AMD machine → 'machine' → shouldMarkVoicemail === true", () => {
    const internal = mapTelnyxAmdResult("machine");
    expect(internal).toBe("machine");
    expect(shouldMarkVoicemail(internal)).toBe(true);
    expect(shouldBridgeToAgent(internal)).toBe(false);
  });

  it("Premium AMD greeting beep_detected (kommer efter machine) → 'machine' → VOICEMAIL", () => {
    const internal = mapTelnyxAmdResult("beep_detected");
    expect(internal).toBe("machine");
    expect(shouldMarkVoicemail(internal)).toBe(true);
  });

  it("Fax-detection → 'fax' → VOICEMAIL (faxmaskine ≠ menneske)", () => {
    const internal = mapTelnyxAmdResult("fax_detected");
    expect(internal).toBe("fax");
    expect(shouldMarkVoicemail(internal)).toBe(true);
  });
});

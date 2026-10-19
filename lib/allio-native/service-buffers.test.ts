import { describe, expect, it } from "vitest";
import {
  bufferMinutesForServiceIds,
  meetingTypeForServiceIds,
  parseServiceIdsJson,
  serializeServiceIds,
} from "./service-buffers";

describe("service-buffers", () => {
  it("roundtrips service ids JSON", () => {
    expect(parseServiceIdsJson(serializeServiceIds(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseServiceIdsJson("not-json")).toEqual([]);
  });

  it("returnerer ONLINE som default uden matchende service-id", () => {
    expect(meetingTypeForServiceIds([])).toBe("ONLINE");
    expect(bufferMinutesForServiceIds([])).toBe(0);
  });

  it("bruger PHYSICAL når physical service-id matcher", () => {
    const physical = (process.env.ALLIO_SERVICE_ID_PHYSICAL ?? "").trim();
    if (!physical) {
      expect(meetingTypeForServiceIds(["unknown"])).toBe("ONLINE");
      return;
    }
    expect(meetingTypeForServiceIds([physical])).toBe("PHYSICAL");
    expect(bufferMinutesForServiceIds([physical])).toBe(60);
  });
});

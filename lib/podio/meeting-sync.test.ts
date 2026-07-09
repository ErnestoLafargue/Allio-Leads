import { describe, expect, it } from "vitest";
import {
  MOEDE_STATUS,
  normalizeMoedeStatus,
  resolveLeadIdFromMoedeItem,
  splitContactName,
} from "@/lib/podio/meeting-sync";
import type { PodioItem } from "@/lib/podio/client";

describe("splitContactName", () => {
  it("splits fornavn and efternavn", () => {
    expect(splitContactName("Anna Jensen")).toEqual({ fornavn: "Anna", efternavn: "Jensen" });
  });

  it("handles single name", () => {
    expect(splitContactName("Anna")).toEqual({ fornavn: "Anna", efternavn: "" });
  });
});

describe("resolveLeadIdFromMoedeItem", () => {
  it("reads from external_id", () => {
    const item = { item_id: 1, external_id: "lead-abc", fields: [] } as PodioItem;
    expect(resolveLeadIdFromMoedeItem(item)).toBe("lead-abc");
  });

  it("reads from Lead-Id field", () => {
    const item = {
      item_id: 1,
      external_id: null,
      fields: [
        {
          field_id: 1,
          external_id: "lead-id",
          label: "Lead-Id",
          type: "text",
          values: [{ value: "lead-from-field" }],
        },
      ],
    } as PodioItem;
    expect(resolveLeadIdFromMoedeItem(item)).toBe("lead-from-field");
  });
});

describe("normalizeMoedeStatus", () => {
  it("maps Podio status labels", () => {
    expect(normalizeMoedeStatus(MOEDE_STATUS.genbook)).toBe("genbook");
    expect(normalizeMoedeStatus(MOEDE_STATUS.tabt)).toBe("tabt");
    expect(normalizeMoedeStatus(MOEDE_STATUS.vundet)).toBe("vundet");
    expect(normalizeMoedeStatus(MOEDE_STATUS.afventer)).toBe("afventer");
  });
});

import { describe, expect, it } from "vitest";
import { detectPodioItemApp, type PodioItem } from "@/lib/podio/client";

function item(partial: Partial<PodioItem> & Pick<PodioItem, "item_id">): PodioItem {
  return {
    external_id: null,
    fields: [],
    ...partial,
  } as PodioItem;
}

describe("detectPodioItemApp", () => {
  it("detects processer from external_id", () => {
    expect(
      detectPodioItemApp(
        item({
          item_id: 1,
          external_id: "lead123-proc-gecko",
          fields: [{ label: "Proces", values: [{ value: "Gecko åbnet" }] }],
        }),
      ),
    ).toBe("processer");
  });

  it("detects moeder from external_id", () => {
    expect(
      detectPodioItemApp(item({ item_id: 2, external_id: "lead123-onboarding" })),
    ).toBe("moeder");
  });

  it("detects kunder from Stadie field", () => {
    expect(
      detectPodioItemApp(
        item({
          item_id: 3,
          external_id: "lead123",
          fields: [{ label: "Stadie", values: [{ value: { text: "Møde booket" } }] }],
        }),
      ),
    ).toBe("kunder");
  });
});

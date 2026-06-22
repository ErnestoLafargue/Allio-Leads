import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PodioItem } from "@/lib/podio/client";

vi.mock("@/lib/podio/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/podio/client")>();
  return {
    ...actual,
    isPodioAppConfigured: vi.fn(() => true),
    findItemIdByExternalId: vi.fn(),
    getItem: vi.fn(),
    updateItemValues: vi.fn(),
    resolveFieldExternalId: vi.fn(async () => "field"),
    resolveCategoryOptionId: vi.fn(async () => 1),
    setPodioFieldValue: vi.fn(),
  };
});

import {
  findItemIdByExternalId,
  getItem,
  updateItemValues,
} from "@/lib/podio/client";
import {
  advanceKundeStadieToGeckoOpened,
  handleGeckoProcesFaerdig,
} from "@/lib/podio/customer-mapping";

function procesItem(overrides: Partial<PodioItem> & Pick<PodioItem, "item_id">): PodioItem {
  return {
    external_id: "lead123-proc-gecko",
    fields: [
      { label: "Proces", values: [{ value: "Gecko åbnet" }] },
      { label: "Status", values: [{ value: { text: "Færdig" } }] },
    ],
    ...overrides,
  } as PodioItem;
}

describe("handleGeckoProcesFaerdig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("ignores non-gecko process", async () => {
    const result = await handleGeckoProcesFaerdig(
      procesItem({
        item_id: 1,
        external_id: "lead123-proc-sms-flow",
        fields: [
          { label: "Proces", values: [{ value: "SMS-kampagneflow" }] },
          { label: "Status", values: [{ value: { text: "Færdig" } }] },
        ],
      } as PodioItem),
    );
    expect(result.reason).toBe("not_gecko");
  });

  it("ignores gecko when status is not Færdig", async () => {
    const result = await handleGeckoProcesFaerdig(
      procesItem({
        item_id: 2,
        fields: [
          { label: "Proces", values: [{ value: "Gecko åbnet" }] },
          { label: "Status", values: [{ value: { text: "I gang" } }] },
        ],
      } as PodioItem),
    );
    expect(result.reason).toBe("not_faerdig");
  });

  it("advances kunde stadie when gecko is Færdig", async () => {
    vi.mocked(findItemIdByExternalId).mockResolvedValue(99);
    vi.mocked(getItem).mockResolvedValue({
      item_id: 99,
      external_id: "lead123",
      fields: [{ label: "Stadie", values: [{ value: { text: "Møde booket" } }] }],
    } as PodioItem);
    vi.mocked(updateItemValues).mockResolvedValue(undefined);

    const result = await handleGeckoProcesFaerdig(procesItem({ item_id: 3 }));
    expect(result.action).toBe("stadie_gecko_aabnet");
    expect(updateItemValues).toHaveBeenCalled();
  });
});

describe("advanceKundeStadieToGeckoOpened", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("noops when kunde already past gecko stadie", async () => {
    vi.mocked(findItemIdByExternalId).mockResolvedValue(100);
    vi.mocked(getItem).mockResolvedValue({
      item_id: 100,
      external_id: "lead456",
      fields: [{ label: "Stadie", values: [{ value: { text: "Kick-off prep" } }] }],
    } as PodioItem);

    const advanced = await advanceKundeStadieToGeckoOpened("lead456");
    expect(advanced).toBe(false);
    expect(updateItemValues).not.toHaveBeenCalled();
  });
});

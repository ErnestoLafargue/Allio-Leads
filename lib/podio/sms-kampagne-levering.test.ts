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
  advanceKundeStadieToSmsLeveret,
  handleSmsKampagneLeveringProcesFaerdig,
} from "@/lib/podio/customer-mapping";

function procesItem(overrides: Partial<PodioItem> & Pick<PodioItem, "item_id">): PodioItem {
  return {
    external_id: "lead123-proc-sms-kampagne-levering",
    fields: [
      { label: "Proces", values: [{ value: "SMS-kampagne levering" }] },
      { label: "Status", values: [{ value: { text: "Færdig" } }] },
    ],
    ...overrides,
  } as PodioItem;
}

describe("handleSmsKampagneLeveringProcesFaerdig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores non-sms process", async () => {
    const result = await handleSmsKampagneLeveringProcesFaerdig(
      procesItem({
        item_id: 1,
        external_id: "lead123-proc-gecko",
        fields: [
          { label: "Proces", values: [{ value: "Gecko åbnet" }] },
          { label: "Status", values: [{ value: { text: "Færdig" } }] },
        ],
      } as PodioItem),
    );
    expect(result.reason).toBe("not_sms_kampagne_levering");
  });

  it("ignores sms process when status is not Færdig", async () => {
    const result = await handleSmsKampagneLeveringProcesFaerdig(
      procesItem({
        item_id: 2,
        fields: [
          { label: "Proces", values: [{ value: "SMS-kampagne levering" }] },
          { label: "Status", values: [{ value: { text: "I gang" } }] },
        ],
      } as PodioItem),
    );
    expect(result.reason).toBe("not_faerdig");
  });

  it("advances kunde stadie when sms-kampagne levering is Færdig", async () => {
    vi.mocked(findItemIdByExternalId).mockResolvedValue(99);
    vi.mocked(getItem).mockResolvedValue({
      item_id: 99,
      external_id: "lead123",
      fields: [{ label: "Stadie", values: [{ value: { text: "Kick-off prep" } }] }],
    } as PodioItem);
    vi.mocked(updateItemValues).mockResolvedValue(undefined);

    const result = await handleSmsKampagneLeveringProcesFaerdig(procesItem({ item_id: 3 }));
    expect(result.action).toBe("stadie_sms_leveret");
    expect(updateItemValues).toHaveBeenCalled();
  });
});

describe("advanceKundeStadieToSmsLeveret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("noops when kunde already past sms leveret stadie", async () => {
    vi.mocked(findItemIdByExternalId).mockResolvedValue(100);
    vi.mocked(getItem).mockResolvedValue({
      item_id: 100,
      external_id: "lead456",
      fields: [{ label: "Stadie", values: [{ value: { text: "Kick-off afholdt" } }] }],
    } as PodioItem);

    const advanced = await advanceKundeStadieToSmsLeveret("lead456");
    expect(advanced).toBe(false);
    expect(updateItemValues).not.toHaveBeenCalled();
  });
});

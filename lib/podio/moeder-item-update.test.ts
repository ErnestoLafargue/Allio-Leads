import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEETING_OUTCOME_IN_PROGRESS, MEETING_OUTCOME_PENDING } from "@/lib/meeting-outcome";
import { MOEDE_STATUS } from "@/lib/podio/meeting-sync";

const getItem = vi.fn();
const readCategoryValue = vi.fn();
const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const activityCreate = vi.fn();
const moveLeadToRebooking = vi.fn();

vi.mock("@/lib/podio/client", () => ({
  getItem: (...args: unknown[]) => getItem(...args),
  readCategoryValue: (...args: unknown[]) => readCategoryValue(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: {
      findUnique: (...args: unknown[]) => leadFindUnique(...args),
      update: (...args: unknown[]) => leadUpdate(...args),
    },
    leadActivityEvent: {
      create: (...args: unknown[]) => activityCreate(...args),
    },
  },
}));

vi.mock("@/lib/calcom/webhook-apply", () => ({
  moveLeadToRebooking: (...args: unknown[]) => moveLeadToRebooking(...args),
}));

vi.mock("@/lib/ensure-system-campaigns", () => ({
  ensureSystemCampaignId: vi.fn(async () => "campaign-active"),
}));

import { applyMoederItemUpdate } from "@/lib/podio/moeder-item-update";

describe("applyMoederItemUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getItem.mockResolvedValue({
      item_id: 42,
      external_id: "lead-1",
      fields: [],
    });
    leadUpdate.mockResolvedValue({});
    activityCreate.mockResolvedValue({});
  });

  it("sets PENDING when Podio status is Afventer afholdelse", async () => {
    readCategoryValue.mockReturnValue(MOEDE_STATUS.afventer);
    leadFindUnique.mockResolvedValue({ meetingOutcomeStatus: MEETING_OUTCOME_IN_PROGRESS });

    const result = await applyMoederItemUpdate(42);

    expect(result.action).toBe("afventer");
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { meetingOutcomeStatus: MEETING_OUTCOME_PENDING },
    });
    expect(activityCreate).toHaveBeenCalled();
  });

  it("sets IN_PROGRESS when Podio status is Under Behandling", async () => {
    readCategoryValue.mockReturnValue(MOEDE_STATUS.underBehandling);
    leadFindUnique.mockResolvedValue({ meetingOutcomeStatus: MEETING_OUTCOME_PENDING });

    const result = await applyMoederItemUpdate(42);

    expect(result.action).toBe("underBehandling");
    expect(leadUpdate).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { meetingOutcomeStatus: MEETING_OUTCOME_IN_PROGRESS },
    });
  });

  it("is idempotent when Under Behandling already applied", async () => {
    readCategoryValue.mockReturnValue(MOEDE_STATUS.underBehandling);
    leadFindUnique.mockResolvedValue({ meetingOutcomeStatus: MEETING_OUTCOME_IN_PROGRESS });

    const result = await applyMoederItemUpdate(42);

    expect(result.action).toBe("noop");
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent when Afventer already PENDING", async () => {
    readCategoryValue.mockReturnValue(MOEDE_STATUS.afventer);
    leadFindUnique.mockResolvedValue({ meetingOutcomeStatus: MEETING_OUTCOME_PENDING });

    const result = await applyMoederItemUpdate(42);

    expect(result.action).toBe("noop");
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});

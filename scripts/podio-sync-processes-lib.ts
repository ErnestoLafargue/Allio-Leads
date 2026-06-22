import { findItemIdByExternalId, getItem, isPodioAppConfigured } from "@/lib/podio/client";

/** Løs Allio lead ID fra leadId (external_id) eller Podio kunde item_id. */
export async function resolveLeadIdFromInput(input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed) && isPodioAppConfigured("kunder")) {
    const item = await getItem("kunder", Number(trimmed));
    const ext = (item?.external_id ?? "").trim();
    return ext || null;
  }

  if (isPodioAppConfigured("kunder")) {
    const itemId = await findItemIdByExternalId("kunder", trimmed);
    if (itemId) return trimmed;
  }

  return trimmed;
}

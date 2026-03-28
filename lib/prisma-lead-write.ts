import { Prisma } from "@prisma/client";

const leadScalarFields = new Set(
  Prisma.dmmf.datamodel.models
    .find((m) => m.name === "Lead")
    ?.fields.filter((f) => f.kind === "scalar")
    .map((f) => f.name) ?? [],
);

export function pickLeadCreateData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (leadScalarFields.has(k)) out[k] = v;
  }
  return out as Prisma.LeadUncheckedCreateInput;
}

export function pickLeadUpdateData(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (leadScalarFields.has(k)) out[k] = v;
  }
  return out as Prisma.LeadUncheckedUpdateInput;
}

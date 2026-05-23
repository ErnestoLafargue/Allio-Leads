export type LeadBulkDeleteInput = {
  id: string;
  status: string;
  notes: string | null;
};

export type LeadBulkDeleteFilterOptions = {
  includeLeadsWithNotes: boolean;
};

export type LeadBulkDeleteFilterSkipped = {
  meetingBooked: number;
  hasOutcome: number;
  hasNotes: number;
};

export type LeadBulkDeleteFilterResult = {
  deletableIds: string[];
  skipped: LeadBulkDeleteFilterSkipped;
};

function hasNotes(notes: string | null | undefined): boolean {
  return Boolean(notes?.trim());
}

/**
 * Filtrerer lead-IDs til masse-sletning.
 * - MEETING_BOOKED kan aldrig slettes.
 * - Kun status NEW kan slettes.
 * - Leads med noter slettes kun hvis includeLeadsWithNotes er true.
 */
export function filterLeadIdsForBulkDelete(
  leads: LeadBulkDeleteInput[],
  ids: string[],
  opts: LeadBulkDeleteFilterOptions,
): LeadBulkDeleteFilterResult {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const deletableIds: string[] = [];
  const skipped: LeadBulkDeleteFilterSkipped = {
    meetingBooked: 0,
    hasOutcome: 0,
    hasNotes: 0,
  };

  for (const id of ids) {
    const lead = byId.get(id);
    if (!lead) continue;

    if (lead.status === "MEETING_BOOKED") {
      skipped.meetingBooked += 1;
      continue;
    }
    if (lead.status !== "NEW") {
      skipped.hasOutcome += 1;
      continue;
    }
    if (!opts.includeLeadsWithNotes && hasNotes(lead.notes)) {
      skipped.hasNotes += 1;
      continue;
    }
    deletableIds.push(id);
  }

  return { deletableIds, skipped };
}

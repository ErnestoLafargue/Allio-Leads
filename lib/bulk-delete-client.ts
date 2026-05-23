export type BulkDeleteLeadSelection = {
  id: string;
  notes?: string | null;
};

export type BulkDeleteConfirmResult =
  | { cancelled: true }
  | { cancelled: false; includeLeadsWithNotes: boolean };

/** Browser-bekræftelse før bulk-delete API-kald. */
export function confirmBulkDeleteSelection(
  selected: BulkDeleteLeadSelection[],
): BulkDeleteConfirmResult {
  if (selected.length === 0) return { cancelled: true };

  const confirmed = window.confirm(
    `Er du sikker på, at du vil slette ${selected.length} lead${selected.length > 1 ? "s" : ""}? Dette kan ikke fortrydes.`,
  );
  if (!confirmed) return { cancelled: true };

  const withNotes = selected.filter((l) => Boolean(l.notes?.trim()));
  if (withNotes.length === 0) {
    return { cancelled: false, includeLeadsWithNotes: false };
  }

  const includeNotes = window.confirm(
    `${withNotes.length} af de valgte leads har noter. Vil du også slette leads med noter?\n\nVælg «OK» for at inkludere dem, eller «Annuller» for kun at slette leads uden noter og med udfald «Ny».`,
  );
  return { cancelled: false, includeLeadsWithNotes: includeNotes };
}

export type BulkDeleteApiSummary = {
  deletedCount: number;
  skippedMeetingBooked: number;
  skippedWithOutcome: number;
  skippedWithNotes: number;
};

export function formatBulkDeleteSummaryMessage(summary: BulkDeleteApiSummary): string | null {
  const parts: string[] = [];
  if (summary.deletedCount > 0) {
    parts.push(
      `${summary.deletedCount} lead${summary.deletedCount > 1 ? "s" : ""} slettet.`,
    );
  }
  if (summary.skippedMeetingBooked > 0) {
    parts.push(
      `${summary.skippedMeetingBooked} med udfald «Møde booket» blev ikke slettet.`,
    );
  }
  if (summary.skippedWithOutcome > 0) {
    parts.push(
      `${summary.skippedWithOutcome} med andet udfald end «Ny» blev ikke slettet.`,
    );
  }
  if (summary.skippedWithNotes > 0) {
    parts.push(`${summary.skippedWithNotes} med noter blev ikke slettet.`);
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

export type BulkDeleteLeadSelection = {
  id: string;
  notes?: string | null;
};

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

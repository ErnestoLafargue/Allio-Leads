export type DataExportKind = {
  id: string;
  label: string;
  description: string;
};

/** Registry for fremtidige dataudtræk. v1: kun udfalds-export. */
export const DATA_EXPORT_KINDS: DataExportKind[] = [
  {
    id: "leads-by-outcome",
    label: "Leads efter udfald",
    description:
      "Træk leads ud filtreret på faste udfald (ikke interesseret, ukvalificeret, møde booket).",
  },
];

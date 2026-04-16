"use client";

import {
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";

type MeetingOutcomeValue =
  | typeof MEETING_OUTCOME_PENDING
  | typeof MEETING_OUTCOME_HELD
  | typeof MEETING_OUTCOME_CANCELLED
  | typeof MEETING_OUTCOME_REBOOK
  | typeof MEETING_OUTCOME_SALE;

const OPTIONS: MeetingOutcomeValue[] = [
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_HELD,
  MEETING_OUTCOME_CANCELLED,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
];

type Props = {
  value: string;
  disabled?: boolean;
  onChange: (value: MeetingOutcomeValue) => void;
  className?: string;
};

export function MeetingOutcomeSelect({ value, disabled = false, onChange, className = "" }: Props) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as MeetingOutcomeValue)}
      className={
        className ||
        "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:opacity-60"
      }
    >
      {OPTIONS.map((option) => (
        <option key={option} value={option}>
          {MEETING_OUTCOME_LABELS[option]}
        </option>
      ))}
    </select>
  );
}

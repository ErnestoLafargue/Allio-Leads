"use client";

type Props = {
  /** true = medtag alle (Ja), false = kun leads med telefonnummer (Nej) */
  includeWithoutPhone: boolean;
  onChange: (includeWithoutPhone: boolean) => void;
  disabled?: boolean;
};

/**
 * SaaS-lignende switch: «Medtag leads uden telefonnummer» — Ja medtager alle, Nej filtrerer tomme numre fra.
 */
export function CampaignPhoneSwitch({ includeWithoutPhone, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-stone-800">Medtag leads uden telefonnummer</p>
      <div className="flex max-w-md items-center gap-4">
        <span
          className={`text-sm font-medium tabular-nums transition-colors ${!includeWithoutPhone ? "text-stone-900" : "text-stone-400"}`}
        >
          Nej
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={includeWithoutPhone}
          aria-label={
            includeWithoutPhone
              ? "Ja: medtag leads uden telefonnummer"
              : "Nej: kun leads med telefonnummer"
          }
          disabled={disabled}
          onClick={() => onChange(!includeWithoutPhone)}
          className={[
            "relative h-9 w-[3.5rem] shrink-0 rounded-full border border-transparent transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2",
            includeWithoutPhone ? "bg-emerald-600" : "bg-stone-300",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            aria-hidden
            className={[
              "absolute top-1 left-1 block h-7 w-7 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-out",
              includeWithoutPhone ? "translate-x-[1.375rem]" : "translate-x-0",
            ].join(" ")}
          />
        </button>
        <span
          className={`text-sm font-medium tabular-nums transition-colors ${includeWithoutPhone ? "text-emerald-800" : "text-stone-400"}`}
        >
          Ja
        </span>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-stone-600">
        Hvis slået fra, medtages kun leads med et registreret telefonnummer.
      </p>
    </div>
  );
}

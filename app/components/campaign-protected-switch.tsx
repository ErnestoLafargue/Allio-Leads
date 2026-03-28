"use client";

type Props = {
  /** true = medtag alle (Ja), false = ekskluder beskyttede (Nej) */
  includeProtected: boolean;
  onChange: (includeProtected: boolean) => void;
  disabled?: boolean;
};

/**
 * SaaS-lignende switch: «Medtag reklamebeskyttede virksomheder» — Ja slår beskyttede med, Nej filtrerer dem fra.
 */
export function CampaignProtectedSwitch({ includeProtected, onChange, disabled }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-stone-800">Medtag reklamebeskyttede virksomheder</p>
      <div className="flex max-w-md items-center gap-4">
        <span
          className={`text-sm font-medium tabular-nums transition-colors ${!includeProtected ? "text-stone-900" : "text-stone-400"}`}
        >
          Nej
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={includeProtected}
          aria-label={includeProtected ? "Ja: medtag reklamebeskyttede" : "Nej: filtrer reklamebeskyttede fra"}
          disabled={disabled}
          onClick={() => onChange(!includeProtected)}
          className={[
            "relative h-9 w-[3.5rem] shrink-0 rounded-full border border-transparent transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2",
            includeProtected ? "bg-emerald-600" : "bg-stone-300",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          ].join(" ")}
        >
          <span
            aria-hidden
            className={[
              "absolute top-1 left-1 block h-7 w-7 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ease-out",
              includeProtected ? "translate-x-[1.375rem]" : "translate-x-0",
            ].join(" ")}
          />
        </button>
        <span
          className={`text-sm font-medium tabular-nums transition-colors ${includeProtected ? "text-emerald-800" : "text-stone-400"}`}
        >
          Ja
        </span>
      </div>
      <p className="max-w-xl text-xs leading-relaxed text-stone-600">
        Hvis slået fra, medtages kun leads der ikke er reklamebeskyttede. Leads uden registreret status medtages også.
      </p>
    </div>
  );
}

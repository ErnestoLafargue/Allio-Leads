"use client";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Advarselsdialog når «Møde booket» forsøges gemt uden tilstrækkelige noter.
 * Kan kun lukkes (X / klik udenfor / Annuller-agtig lukning) — der er bevidst
 * ingen «Fortsæt alligevel», da noterne er påkrævet.
 */
export function MeetingNotesRequiredDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-notes-required-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-xl border-2 border-amber-300 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Luk"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>

        <h2
          id="meeting-notes-required-title"
          className="pr-8 text-lg font-semibold text-stone-900"
        >
          Noter mangler
        </h2>
        <p className="mt-2 text-sm text-stone-600">
          Før mødet kan bookes, skal der skrives noter på leadet. Noterne bruges til at
          forberede næste møde — skriv hvad kunden fandt interessant, hvad der blev aftalt,
          og hvad der blev lovet på opkaldet.
        </p>
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-medium">Gode ting at få med:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Hvor længe har virksomheden eksisteret?</li>
            <li>Hvor mange ansatte har de?</li>
            <li>Kører de markedsføring i dag?</li>
            <li>Hvilket bookingsystem bruger de — og hvor længe har de brugt det?</li>
            <li>Hvad er prisen på en standardydelse?</li>
          </ul>
        </div>
        <p className="mt-3 text-sm text-stone-600">
          Luk denne besked, skriv noterne i notefeltet, og prøv igen.
        </p>
      </div>
    </div>
  );
}

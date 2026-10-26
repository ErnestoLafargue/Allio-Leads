"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  /** @deprecated Beholdt for kompatibilitet — indstillingen styres ikke længere her. */
  onSaved?: (minutes: number) => void;
};

/**
 * Admin-dialog: forklarer faste møde-/transportregler.
 * Den tidligere 55/75-min valgmulighed bruges ikke længere til ledighed.
 */
export function MeetingBlockSettingDialog({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meeting-block-setting-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border-2 border-stone-300 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="meeting-block-setting-title" className="text-lg font-semibold text-stone-900">
          Kalender-indstillinger
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Ledige booking-tider følger faste regler pr. mødetype:
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-stone-700">
          <li>
            <strong>Onlinemøde:</strong> 60 minutter. Ingen transport.
          </li>
          <li>
            <strong>Fysisk møde:</strong> 90 minutter + 60 minutter transport før start og 60
            minutter efter slut. Transportblokeringer må overlappe hinanden.
          </li>
        </ul>
        <p className="mt-3 text-xs text-stone-500">
          Eksempel: fysisk møde kl. 10.00–11.30 med transport til 12.30. Næste booking kan starte
          kl. 12.30.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900"
          >
            Luk
          </button>
        </div>
      </div>
    </div>
  );
}

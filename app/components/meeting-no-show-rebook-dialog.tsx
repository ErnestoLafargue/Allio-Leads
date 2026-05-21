"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (sendToRebooking: boolean) => void;
};

export function MeetingNoShowRebookDialog({ open, onClose, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="no-show-rebook-title"
    >
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-6 shadow-xl">
        <h2 id="no-show-rebook-title" className="text-lg font-semibold text-stone-900">
          Ej mødt
        </h2>
        <p className="mt-2 text-sm text-stone-600">Skal mødet sendes til genbooking?</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Annuller
          </button>
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          >
            Nej
          </button>
          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
          >
            Ja
          </button>
        </div>
      </div>
    </div>
  );
}

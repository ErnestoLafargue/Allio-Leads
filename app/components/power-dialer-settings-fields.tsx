"use client";

import {
  POWER_DIALER_DEFAULTS,
  POWER_DIALER_LIMITS,
  type PowerAmdUncertainAction,
  type PowerDialerSettings,
  type PowerPauseMode,
} from "@/lib/power-dialer-settings";

type Props = {
  value: PowerDialerSettings;
  onChange: (next: PowerDialerSettings) => void;
  disabled?: boolean;
};

function numField(
  value: PowerDialerSettings,
  onChange: (next: PowerDialerSettings) => void,
  key: keyof Pick<PowerDialerSettings, "dialRatio" | "maxInFlight" | "ringTimeoutSecs" | "maxDropRatePct" | "wrapUpSeconds">,
  raw: string,
) {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return;
  onChange({ ...value, [key]: n });
}

export function PowerDialerSettingsFields({ value, onChange, disabled }: Props) {
  const d = POWER_DIALER_DEFAULTS;
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-2">
      <label className="block text-xs font-medium text-stone-700">
        Linjer pr. klar sælger
        <input
          type="number"
          min={POWER_DIALER_LIMITS.dialRatio.min}
          max={POWER_DIALER_LIMITS.dialRatio.max}
          step={POWER_DIALER_LIMITS.dialRatio.step}
          value={value.dialRatio}
          disabled={disabled}
          onChange={(e) => numField(value, onChange, "dialRatio", e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block font-normal text-stone-500">
          Standard {d.dialRatio}. Ved 5 sælgere klar og {value.dialRatio} linjer er målet{" "}
          {Math.floor(5 * value.dialRatio)} samtidige opkald (under loftet).
        </span>
      </label>

      <label className="block text-xs font-medium text-stone-700">
        Maks. samtidige opkald i kampagnen
        <input
          type="number"
          min={POWER_DIALER_LIMITS.maxInFlight.min}
          max={POWER_DIALER_LIMITS.maxInFlight.max}
          step={1}
          value={value.maxInFlight}
          disabled={disabled}
          onChange={(e) => numField(value, onChange, "maxInFlight", e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block font-normal text-stone-500">Standard {d.maxInFlight}. Loft for uforbundne lead-opkald.</span>
      </label>

      <label className="block text-xs font-medium text-stone-700">
        Ringetid (sekunder)
        <input
          type="number"
          min={POWER_DIALER_LIMITS.ringTimeoutSecs.min}
          max={POWER_DIALER_LIMITS.ringTimeoutSecs.max}
          step={1}
          value={value.ringTimeoutSecs}
          disabled={disabled}
          onChange={(e) => numField(value, onChange, "ringTimeoutSecs", e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block font-normal text-stone-500">
          Standard {d.ringTimeoutSecs} sek. Derefter tæller opkaldet som «træffes ikke».
        </span>
      </label>

      <label className="block text-xs font-medium text-stone-700">
        Maks. drop-rate (%)
        <input
          type="number"
          min={POWER_DIALER_LIMITS.maxDropRatePct.min}
          max={POWER_DIALER_LIMITS.maxDropRatePct.max}
          step={1}
          value={value.maxDropRatePct}
          disabled={disabled}
          onChange={(e) => numField(value, onChange, "maxDropRatePct", e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block font-normal text-stone-500">
          Standard {d.maxDropRatePct} %. 0 = slået fra. Over loftet ringes kun 1 linje pr. sælger.
        </span>
      </label>

      <label className="block text-xs font-medium text-stone-700">
        Pause mellem opkald (sekunder)
        <input
          type="number"
          min={POWER_DIALER_LIMITS.wrapUpSeconds.min}
          max={POWER_DIALER_LIMITS.wrapUpSeconds.max}
          step={1}
          value={value.wrapUpSeconds}
          disabled={disabled}
          onChange={(e) => numField(value, onChange, "wrapUpSeconds", e.target.value)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <span className="mt-1 block font-normal text-stone-500">
          Standard {d.wrapUpSeconds}. Sælgeren er ikke klar, mens et lead er åbent, plus denne pause.
        </span>
      </label>

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-xs font-medium text-stone-700">Når AMD er usikker</legend>
        {(
          [
            ["CONNECT", "Forbind til sælger (anbefalet)"],
            ["REQUEUE", "Læg på og prøv leadet igen senere"],
          ] as const satisfies ReadonlyArray<readonly [PowerAmdUncertainAction, string]>
        ).map(([id, label]) => (
          <label key={id} className="flex cursor-pointer items-start gap-2 text-xs text-stone-700">
            <input
              type="radio"
              name="powerAmdUncertainAction"
              checked={value.amdUncertainAction === id}
              disabled={disabled}
              onChange={() => onChange({ ...value, amdUncertainAction: id })}
              className="mt-0.5"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2 border-0 p-0">
        <legend className="text-xs font-medium text-stone-700">Pause</legend>
        {(
          [
            ["DRAIN", "Stop nye opkald — afslut dem der allerede ringer"],
            ["HANGUP_RINGING", "Stop nye opkald og læg ringende på med det samme"],
          ] as const satisfies ReadonlyArray<readonly [PowerPauseMode, string]>
        ).map(([id, label]) => (
          <label key={id} className="flex cursor-pointer items-start gap-2 text-xs text-stone-700">
            <input
              type="radio"
              name="powerPauseMode"
              checked={value.pauseMode === id}
              disabled={disabled}
              onChange={() => onChange({ ...value, pauseMode: id })}
              className="mt-0.5"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="flex cursor-pointer items-start gap-2 text-xs text-stone-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.amdEnabled}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, amdEnabled: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 rounded border-stone-400 text-emerald-700"
        />
        <span>
          Telefonsvarer-genkendelse (AMD). Fra: forbind så snart nogen tager telefonen.
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 text-xs text-stone-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={value.amdMachineCountsAttempt}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, amdMachineCountsAttempt: e.target.checked })}
          className="mt-0.5 h-3.5 w-3.5 rounded border-stone-400 text-emerald-700"
        />
        <span>Telefonsvarer tæller som kontaktforsøg.</span>
      </label>
    </div>
  );
}

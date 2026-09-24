/**
 * Power Dialer-indstillinger pr. kampagne (kolonner på `Campaign` med prefix `power`).
 * Defaults svarer til adfærden før indstillingerne fandtes (ratio 5, loft 50, ringetid 25 sek.).
 */

export const POWER_AMD_UNCERTAIN_ACTIONS = ["CONNECT", "REQUEUE"] as const;
export type PowerAmdUncertainAction = (typeof POWER_AMD_UNCERTAIN_ACTIONS)[number];

export const POWER_PAUSE_MODES = ["DRAIN", "HANGUP_RINGING"] as const;
export type PowerPauseMode = (typeof POWER_PAUSE_MODES)[number];

export type PowerDialerSettings = {
  /** Samtidige udgående linjer pr. klar sælger. */
  dialRatio: number;
  /** Maks. samtidige uforbundne lead-opkald i kampagnen. */
  maxInFlight: number;
  /** Sekunder et lead-opkald må ringe, før det opgives. */
  ringTimeoutSecs: number;
  amdEnabled: boolean;
  amdUncertainAction: PowerAmdUncertainAction;
  amdMachineCountsAttempt: boolean;
  /** Drop-loft i procent (0 = fra). */
  maxDropRatePct: number;
  /** Sekunder efter gemt udfald, før sælgeren er klar igen. */
  wrapUpSeconds: number;
  pauseMode: PowerPauseMode;
};

export const POWER_DIALER_DEFAULTS: Readonly<PowerDialerSettings> = Object.freeze({
  dialRatio: 5,
  maxInFlight: 50,
  ringTimeoutSecs: 25,
  amdEnabled: true,
  amdUncertainAction: "CONNECT",
  amdMachineCountsAttempt: true,
  maxDropRatePct: 3,
  wrapUpSeconds: 0,
  pauseMode: "DRAIN",
});

export const POWER_DIALER_LIMITS = {
  dialRatio: { min: 1, max: 8, step: 0.5 },
  maxInFlight: { min: 1, max: 200 },
  ringTimeoutSecs: { min: 10, max: 60 },
  maxDropRatePct: { min: 0, max: 20 },
  wrapUpSeconds: { min: 0, max: 300 },
} as const;

/** Prisma-select for kampagnens Power-kolonner. */
export const POWER_DIALER_CAMPAIGN_SELECT = {
  powerDialRatio: true,
  powerMaxInFlight: true,
  powerRingTimeoutSecs: true,
  powerAmdEnabled: true,
  powerAmdUncertainAction: true,
  powerAmdMachineCountsAttempt: true,
  powerMaxDropRatePct: true,
  powerWrapUpSeconds: true,
  powerPauseMode: true,
} as const;

export type PowerDialerCampaignColumns = {
  powerDialRatio: number;
  powerMaxInFlight: number;
  powerRingTimeoutSecs: number;
  powerAmdEnabled: boolean;
  powerAmdUncertainAction: string;
  powerAmdMachineCountsAttempt: boolean;
  powerMaxDropRatePct: number;
  powerWrapUpSeconds: number;
  powerPauseMode: string;
};

function clampNumber(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundToStep(v: number, step: number): number {
  return Math.round(v / step) * step;
}

function finiteOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function normalizeDialRatio(v: unknown): number {
  const { min, max, step } = POWER_DIALER_LIMITS.dialRatio;
  return clampNumber(roundToStep(finiteOr(v, POWER_DIALER_DEFAULTS.dialRatio), step), min, max);
}

function normalizeInt(v: unknown, fallback: number, limits: { min: number; max: number }): number {
  return clampNumber(Math.round(finiteOr(v, fallback)), limits.min, limits.max);
}

export function isPowerAmdUncertainAction(v: unknown): v is PowerAmdUncertainAction {
  return typeof v === "string" && (POWER_AMD_UNCERTAIN_ACTIONS as readonly string[]).includes(v);
}

export function isPowerPauseMode(v: unknown): v is PowerPauseMode {
  return typeof v === "string" && (POWER_PAUSE_MODES as readonly string[]).includes(v);
}

/** Læs + normalisér indstillinger fra en kampagnerække (manglende/ugyldige værdier → defaults). */
export function powerDialerSettingsFromCampaign(
  row: Partial<PowerDialerCampaignColumns> | null | undefined,
): PowerDialerSettings {
  const d = POWER_DIALER_DEFAULTS;
  return {
    dialRatio: normalizeDialRatio(row?.powerDialRatio),
    maxInFlight: normalizeInt(row?.powerMaxInFlight, d.maxInFlight, POWER_DIALER_LIMITS.maxInFlight),
    ringTimeoutSecs: normalizeInt(
      row?.powerRingTimeoutSecs,
      d.ringTimeoutSecs,
      POWER_DIALER_LIMITS.ringTimeoutSecs,
    ),
    amdEnabled: typeof row?.powerAmdEnabled === "boolean" ? row.powerAmdEnabled : d.amdEnabled,
    amdUncertainAction: isPowerAmdUncertainAction(row?.powerAmdUncertainAction)
      ? row.powerAmdUncertainAction
      : d.amdUncertainAction,
    amdMachineCountsAttempt:
      typeof row?.powerAmdMachineCountsAttempt === "boolean"
        ? row.powerAmdMachineCountsAttempt
        : d.amdMachineCountsAttempt,
    maxDropRatePct: normalizeInt(
      row?.powerMaxDropRatePct,
      d.maxDropRatePct,
      POWER_DIALER_LIMITS.maxDropRatePct,
    ),
    wrapUpSeconds: normalizeInt(row?.powerWrapUpSeconds, d.wrapUpSeconds, POWER_DIALER_LIMITS.wrapUpSeconds),
    pauseMode: isPowerPauseMode(row?.powerPauseMode) ? row.powerPauseMode : d.pauseMode,
  };
}

export function powerDialerSettingsToColumns(s: PowerDialerSettings): PowerDialerCampaignColumns {
  return {
    powerDialRatio: s.dialRatio,
    powerMaxInFlight: s.maxInFlight,
    powerRingTimeoutSecs: s.ringTimeoutSecs,
    powerAmdEnabled: s.amdEnabled,
    powerAmdUncertainAction: s.amdUncertainAction,
    powerAmdMachineCountsAttempt: s.amdMachineCountsAttempt,
    powerMaxDropRatePct: s.maxDropRatePct,
    powerWrapUpSeconds: s.wrapUpSeconds,
    powerPauseMode: s.pauseMode,
  };
}

function parseNumberInput(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const t = raw.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

type IntField = "maxInFlight" | "ringTimeoutSecs" | "maxDropRatePct" | "wrapUpSeconds";

const INT_FIELD_LABELS: Record<IntField, string> = {
  maxInFlight: "Maks. samtidige opkald",
  ringTimeoutSecs: "Ringetid",
  maxDropRatePct: "Maks. drop-rate",
  wrapUpSeconds: "Pause mellem opkald",
};

export type PowerDialerSettingsPatchResult =
  | { ok: true; settings: PowerDialerSettings }
  | { ok: false; error: string };

/**
 * Validér et (delvist) PATCH-objekt fra kampagne-UI oven på de nuværende indstillinger.
 * Afviser værdier uden for grænserne i stedet for at klippe dem stille.
 */
export function applyPowerDialerSettingsPatch(
  current: PowerDialerSettings,
  raw: unknown,
): PowerDialerSettingsPatchResult {
  if (raw === null || raw === undefined) return { ok: true, settings: { ...current } };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Ugyldige Power Dialer-indstillinger." };
  }
  const body = raw as Record<string, unknown>;
  const next: PowerDialerSettings = { ...current };

  if (body.dialRatio !== undefined) {
    const n = parseNumberInput(body.dialRatio);
    const { min, max, step } = POWER_DIALER_LIMITS.dialRatio;
    if (n === null || n < min || n > max) {
      return { ok: false, error: `Linjer pr. klar sælger skal være mellem ${min} og ${max}.` };
    }
    next.dialRatio = clampNumber(roundToStep(n, step), min, max);
  }

  for (const field of ["maxInFlight", "ringTimeoutSecs", "maxDropRatePct", "wrapUpSeconds"] as const) {
    if (body[field] === undefined) continue;
    const n = parseNumberInput(body[field]);
    const { min, max } = POWER_DIALER_LIMITS[field];
    if (n === null || !Number.isInteger(n) || n < min || n > max) {
      return {
        ok: false,
        error: `${INT_FIELD_LABELS[field]} skal være et heltal mellem ${min} og ${max}.`,
      };
    }
    next[field] = n;
  }

  if (body.amdEnabled !== undefined) {
    if (typeof body.amdEnabled !== "boolean") {
      return { ok: false, error: "Telefonsvarer-genkendelse skal være til eller fra." };
    }
    next.amdEnabled = body.amdEnabled;
  }
  if (body.amdMachineCountsAttempt !== undefined) {
    if (typeof body.amdMachineCountsAttempt !== "boolean") {
      return { ok: false, error: "«Telefonsvarer tæller som kontaktforsøg» skal være ja eller nej." };
    }
    next.amdMachineCountsAttempt = body.amdMachineCountsAttempt;
  }
  if (body.amdUncertainAction !== undefined) {
    if (!isPowerAmdUncertainAction(body.amdUncertainAction)) {
      return { ok: false, error: "Ugyldigt valg for usikkert AMD-resultat." };
    }
    next.amdUncertainAction = body.amdUncertainAction;
  }
  if (body.pauseMode !== undefined) {
    if (!isPowerPauseMode(body.pauseMode)) {
      return { ok: false, error: "Ugyldigt valg for pause." };
    }
    next.pauseMode = body.pauseMode;
  }
  return { ok: true, settings: next };
}

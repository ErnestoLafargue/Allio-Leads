import { performanceIndex } from "@/lib/dashboard/metric-catalog";
import type { DashboardTargetConfig, PerformanceIndex } from "@/lib/dashboard/types";

export const DEFAULT_MEETINGS_PER_ACTIVE_DAY = 3;

export function normalizeTargetConfig(
  raw?: DashboardTargetConfig | null,
): Required<DashboardTargetConfig> {
  return {
    perActiveDay:
      typeof raw?.perActiveDay === "number" && raw.perActiveDay > 0
        ? raw.perActiveDay
        : DEFAULT_MEETINGS_PER_ACTIVE_DAY,
    redBelowPct:
      typeof raw?.redBelowPct === "number" && raw.redBelowPct > 0 ? raw.redBelowPct : 80,
    yellowBelowPct:
      typeof raw?.yellowBelowPct === "number" && raw.yellowBelowPct > 0
        ? raw.yellowBelowPct
        : 100,
  };
}

export function evaluateTargetProgress(params: {
  actual: number;
  activeDays: number;
  target?: DashboardTargetConfig | null;
}): {
  targetValue: number;
  pctOfTarget: number;
  index: PerformanceIndex;
  remaining: number;
} {
  const cfg = normalizeTargetConfig(params.target);
  const targetValue = cfg.perActiveDay * Math.max(0, params.activeDays);
  const pctOfTarget =
    targetValue > 0 ? Math.round((params.actual / targetValue) * 1000) / 10 : params.actual > 0 ? 100 : 0;
  return {
    targetValue,
    pctOfTarget,
    index: performanceIndex(pctOfTarget, cfg.redBelowPct, cfg.yellowBelowPct),
    remaining: Math.max(0, targetValue - params.actual),
  };
}

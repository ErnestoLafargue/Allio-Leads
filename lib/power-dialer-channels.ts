import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseTelnyxOutboundChannelLimitFromEnv } from "@/lib/dialer-dispatch-math";
import {
  getTelnyxCallControlOutboundChannelLimit,
  getTelnyxConnectionId,
} from "@/lib/telnyx-call-control";

/** AppSetting-nøgle: samlet udgående kanalgrænse for Power Dialer (alle kampagner). Tom = automatisk. */
export const POWER_CHANNEL_LIMIT_SETTING_KEY = "power_dialer_channel_limit";

export const POWER_CHANNEL_LIMIT_BOUNDS = { min: 1, max: 500 } as const;

const TELNYX_LIMIT_CACHE_MS = 5 * 60 * 1000;
let telnyxLimitCache: { at: number; appId: string; limit: number | null } | null = null;

export async function getPowerChannelLimitOverride(): Promise<number | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: POWER_CHANNEL_LIMIT_SETTING_KEY },
    select: { value: true },
  });
  const n = row ? Number.parseInt(row.value, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < POWER_CHANNEL_LIMIT_BOUNDS.min) return null;
  return Math.min(n, POWER_CHANNEL_LIMIT_BOUNDS.max);
}

export async function setPowerChannelLimitOverride(limit: number | null): Promise<void> {
  if (limit === null) {
    await prisma.appSetting.deleteMany({ where: { key: POWER_CHANNEL_LIMIT_SETTING_KEY } });
    return;
  }
  if (
    !Number.isInteger(limit) ||
    limit < POWER_CHANNEL_LIMIT_BOUNDS.min ||
    limit > POWER_CHANNEL_LIMIT_BOUNDS.max
  ) {
    throw new Error(
      `Kanalgrænsen skal være et heltal mellem ${POWER_CHANNEL_LIMIT_BOUNDS.min} og ${POWER_CHANNEL_LIMIT_BOUNDS.max}.`,
    );
  }
  await prisma.appSetting.upsert({
    where: { key: POWER_CHANNEL_LIMIT_SETTING_KEY },
    update: { value: String(limit) },
    create: { key: POWER_CHANNEL_LIMIT_SETTING_KEY, value: String(limit) },
  });
}

/** Kanalgrænsen på Telnyx Call Control-appen (cachet 5 min.). null = ukendt / ikke sat. */
export async function getTelnyxAppChannelLimit(): Promise<number | null> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  const appId = getTelnyxConnectionId();
  if (!apiKey || !appId) return null;
  const now = Date.now();
  if (telnyxLimitCache && telnyxLimitCache.appId === appId && now - telnyxLimitCache.at < TELNYX_LIMIT_CACHE_MS) {
    return telnyxLimitCache.limit;
  }
  const res = await getTelnyxCallControlOutboundChannelLimit({ apiKey, applicationId: appId });
  const limit = res.ok ? res.channelLimit : (telnyxLimitCache?.limit ?? null);
  telnyxLimitCache = { at: now, appId, limit };
  return limit;
}

export type PowerChannelLimitInfo = {
  /** Den grænse dispatch bruger (laveste af de kendte), null = ingen kendt grænse. */
  effective: number | null;
  override: number | null;
  env: number | null;
  telnyxApp: number | null;
};

export async function resolvePowerChannelLimit(): Promise<PowerChannelLimitInfo> {
  const [override, telnyxApp] = await Promise.all([
    getPowerChannelLimitOverride(),
    getTelnyxAppChannelLimit().catch(() => null),
  ]);
  const env = parseTelnyxOutboundChannelLimitFromEnv(process.env.TELNYX_OUTBOUND_CHANNEL_LIMIT);
  const known = [override, env, telnyxApp].filter((n): n is number => typeof n === "number");
  return { effective: known.length > 0 ? Math.min(...known) : null, override, env, telnyxApp };
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * PSTN-lead-ben der optager en udgående kanal på Telnyx-appen lige nu (alle kampagner):
 * aktive kø-reservationer (ringer, besvaret eller forbundet til sælger).
 */
export async function countPowerChannelsInUse(db: Db, now: Date): Promise<number> {
  return db.dialerQueueItem.count({
    where: { OR: [{ expiresAt: { gt: now } }, { connectedAt: { not: null } }] },
  });
}

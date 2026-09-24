import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  POWER_CHANNEL_LIMIT_BOUNDS,
  resolvePowerChannelLimit,
  setPowerChannelLimitOverride,
} from "@/lib/power-dialer-channels";

/**
 * Globale Power Dialer-indstillinger (admin): samlet udgående kanalgrænse for Telnyx-appen.
 * Tom = automatisk (laveste af Telnyx-appens grænse og TELNYX_OUTBOUND_CHANNEL_LIMIT).
 */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const channel = await resolvePowerChannelLimit();
  return NextResponse.json({ ok: true, channelLimit: channel, bounds: POWER_CHANNEL_LIMIT_BOUNDS });
}

export async function PUT(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json().catch(() => null);
  const raw = body?.channelLimit;
  let limit: number | null = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
    if (
      !Number.isInteger(n) ||
      n < POWER_CHANNEL_LIMIT_BOUNDS.min ||
      n > POWER_CHANNEL_LIMIT_BOUNDS.max
    ) {
      return NextResponse.json(
        {
          error: `Kanalgrænsen skal være et heltal mellem ${POWER_CHANNEL_LIMIT_BOUNDS.min} og ${POWER_CHANNEL_LIMIT_BOUNDS.max}, eller tom for automatisk.`,
        },
        { status: 400 },
      );
    }
    limit = n;
  }
  await setPowerChannelLimitOverride(limit);
  const channel = await resolvePowerChannelLimit();
  return NextResponse.json({ ok: true, channelLimit: channel, bounds: POWER_CHANNEL_LIMIT_BOUNDS });
}

export const runtime = "nodejs";

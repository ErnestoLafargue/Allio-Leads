import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ensurePowerDialerAgentTelnyx } from "@/lib/telnyx-power-agent";

/**
 * Admin: status og klargøring af sælgernes Telnyx-forbindelser til Power Dialer
 * (gencred-brugernavn + SIP URI-opkald `internal`). Sker også automatisk ved Power-start.
 */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const users = await prisma.user.findMany({
    where: { role: { in: ["SELLER", "ADMIN"] } },
    select: {
      id: true,
      name: true,
      username: true,
      telnyxCredentialId: true,
      telnyxCredentialSipUsername: true,
      telnyxSipUriCallingEnabledAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({
    ok: true,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      username: u.username,
      provisioned: Boolean(u.telnyxCredentialId),
      hasSipUsername: Boolean(u.telnyxCredentialSipUsername),
      sipUriCallingEnabled: Boolean(u.telnyxSipUriCallingEnabledAt),
    })),
  });
}

export async function POST() {
  const { response } = await requireAdmin();
  if (response) return response;
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "TELNYX_API_KEY mangler." }, { status: 503 });
  }
  const users = await prisma.user.findMany({
    where: { role: { in: ["SELLER", "ADMIN"] }, telnyxCredentialId: { not: null } },
    select: { id: true, name: true },
  });
  const results: { userId: string; name: string; ok: boolean; message: string | null }[] = [];
  for (const u of users) {
    const r = await ensurePowerDialerAgentTelnyx({ userId: u.id, apiKey, force: true }).catch((err) => ({
      ok: false,
      message: err instanceof Error ? err.message : "Ukendt fejl",
    }));
    results.push({ userId: u.id, name: u.name, ok: r.ok, message: r.message ?? null });
  }
  return NextResponse.json({
    ok: true,
    summary: { total: results.length, ok: results.filter((r) => r.ok).length },
    results,
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { provisionTelnyxAgentsForUsers } from "@/lib/telnyx-provision-agents-server";

/**
 * Provisionér per-agent Telnyx Telephony Credentials til alle (eller udvalgte) brugere
 * der endnu ikke har en. Hver agent får:
 *
 * - En unik Credential Connection (SIP-konto) med navn `allioagent{userId}`
 * - En Telephony Credential (JWT-issuer) bundet til ovennævnte
 * - Begge id'er gemmes i User.telnyxCredentialId + User.telnyxSipUsername
 *
 * Hver agent får derefter:
 * - Deres egen WebRTC login_token (genereres dynamisk i token-routen)
 * - En unik SIP-URI: sip:{telnyxSipUsername}@sip.telnyx.com som dispatcher kan ringe op
 *
 * GET    → liste over agenter + provisionering-status
 * POST   → provisionér alle manglende (kan begrænses med { userIds: string[] })
 */

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    where: { role: { in: [ROLE_SELLER, ROLE_ADMIN] } },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      telnyxCredentialId: true,
      telnyxSipUsername: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      provisioned: Boolean(u.telnyxCredentialId && u.telnyxSipUsername),
      credentialIdHint: u.telnyxCredentialId
        ? u.telnyxCredentialId.length > 4
          ? `…${u.telnyxCredentialId.slice(-4)}`
          : u.telnyxCredentialId
        : null,
      sipUsername: u.telnyxSipUsername,
    })),
  });
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const userIds: string[] | null = Array.isArray(body?.userIds)
    ? body.userIds.filter((s: unknown): s is string => typeof s === "string")
    : null;
  const force = Boolean(body?.force);

  const out = await provisionTelnyxAgentsForUsers({ userIds, force });
  if (!out.ok) {
    const status = out.code === "TELNYX_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json({ ok: false, code: out.code, error: out.error }, { status });
  }

  return NextResponse.json({ ok: true, summary: out.summary, results: out.results });
}

export const runtime = "nodejs";

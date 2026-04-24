import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  createTelnyxCredentialConnection,
  createTelnyxTelephonyCredential,
  listTelnyxOutboundVoiceProfiles,
} from "@/lib/telnyx-call-control";

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

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

function buildConnectionName(userId: string): string {
  return `allioagent${sanitize(userId)}`;
}

function buildSipUsername(userId: string): string {
  // Telnyx kræver alfanumerisk + lowercase. cuid() er allerede alfanumerisk.
  return `allio${sanitize(userId).toLowerCase()}`;
}

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

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: "TELNYX_NOT_CONFIGURED", error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => null);
  const userIds: string[] | null = Array.isArray(body?.userIds)
    ? body.userIds.filter((s: unknown): s is string => typeof s === "string")
    : null;
  const force = Boolean(body?.force);

  // Find Outbound Voice Profile (krævet for at agentens udgående numre kan rute til PSTN
  // via "originate-and-bridge" — bruges når dispatcher ringer agenten op).
  const profilesRes = await listTelnyxOutboundVoiceProfiles({ apiKey });
  if (!profilesRes.ok || profilesRes.profiles.length === 0) {
    return NextResponse.json(
      {
        code: "TELNYX_NO_OUTBOUND_VOICE_PROFILE",
        error: "Telnyx har ingen Outbound Voice Profile på kontoen.",
      },
      { status: 400 },
    );
  }
  const outboundVoiceProfileId = profilesRes.profiles[0].id;

  const where = userIds && userIds.length > 0
    ? { id: { in: userIds } }
    : { role: { in: [ROLE_SELLER, ROLE_ADMIN] } };

  const targetUsers = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      telnyxCredentialId: true,
      telnyxSipUsername: true,
    },
  });

  type ProvisionResult = {
    userId: string;
    username: string;
    name: string;
    status: "ok" | "skipped" | "failed";
    credentialId?: string;
    sipUsername?: string;
    error?: string;
  };
  const results: ProvisionResult[] = [];

  for (const user of targetUsers) {
    if (!force && user.telnyxCredentialId && user.telnyxSipUsername) {
      results.push({
        userId: user.id,
        username: user.username,
        name: user.name,
        status: "skipped",
        credentialId: user.telnyxCredentialId,
        sipUsername: user.telnyxSipUsername,
      });
      continue;
    }

    const connectionName = buildConnectionName(user.id);
    const sipUsername = buildSipUsername(user.id);

    // Trin 1: Opret per-agent Credential Connection (SIP-konto)
    const cc = await createTelnyxCredentialConnection({
      apiKey,
      name: connectionName,
      userName: sipUsername,
      tag: "allioagent",
      outboundVoiceProfileId,
    });
    if (!cc.ok) {
      // 422 "name already exists" tolerer vi — så bruger vi den eksisterende.
      // Men listen tilbage er ikke trivial uden navnefilter; for nu fejler vi.
      results.push({
        userId: user.id,
        username: user.username,
        name: user.name,
        status: "failed",
        error: `Credential Connection: ${cc.message}`,
      });
      continue;
    }

    // Trin 2: Opret Telephony Credential bundet til denne connection
    const tc = await createTelnyxTelephonyCredential({
      apiKey,
      connectionId: cc.connection.id,
      name: `Allio Agent ${user.name} (${user.username})`,
      tag: "allioagent",
      // Ingen udløbstid — credentials lever til admin manuelt sletter dem
      expiresAtIso: null,
    });
    if (!tc.ok) {
      results.push({
        userId: user.id,
        username: user.username,
        name: user.name,
        status: "failed",
        error: `Telephony Credential: ${tc.message}`,
      });
      continue;
    }

    // Trin 3: Gem på User-rækken
    await prisma.user.update({
      where: { id: user.id },
      data: {
        telnyxCredentialId: tc.credential.id,
        telnyxSipUsername: sipUsername,
      },
    });

    results.push({
      userId: user.id,
      username: user.username,
      name: user.name,
      status: "ok",
      credentialId: tc.credential.id,
      sipUsername,
    });
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };

  return NextResponse.json({ ok: true, summary, results });
}

export const runtime = "nodejs";

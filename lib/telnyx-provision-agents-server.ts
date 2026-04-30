import { prisma } from "@/lib/prisma";
import {
  createTelnyxCredentialConnection,
  createTelnyxTelephonyCredential,
  listTelnyxOutboundVoiceProfiles,
} from "@/lib/telnyx-call-control";

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9]/g, "");
}

function buildConnectionName(userId: string): string {
  const core = sanitize(userId).toLowerCase();
  // Telnyx credential connection_name max = 32 chars.
  // Keep deterministic suffix from user id to avoid collisions.
  const suffix = core.slice(-22) || "agent";
  return `allioagent${suffix}`.slice(0, 32);
}

function buildSipUsername(userId: string): string {
  const core = sanitize(userId).toLowerCase();
  // Keep username compact to avoid provider-side length constraints.
  const suffix = core.slice(-24) || "user";
  return `allio${suffix}`.slice(0, 30);
}

export type ProvisionAgentRowResult = {
  userId: string;
  username: string;
  name: string;
  status: "ok" | "skipped" | "failed";
  credentialId?: string;
  sipUsername?: string;
  error?: string;
};

export type ProvisionAgentsSuccess = {
  ok: true;
  summary: { total: number; ok: number; skipped: number; failed: number };
  results: ProvisionAgentRowResult[];
};

export type ProvisionAgentsFailure = {
  ok: false;
  code: string;
  error: string;
};

/**
 * Samme logik som POST /api/telnyx/admin/provision-agents (uden admin-sessionstjek).
 * Bruges af API-routen og af CLI-scriptet `scripts/provision-telnyx-agents.ts`.
 */
export async function provisionTelnyxAgentsForUsers(options: {
  userIds?: string[] | null;
  force?: boolean;
}): Promise<ProvisionAgentsSuccess | ProvisionAgentsFailure> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "TELNYX_NOT_CONFIGURED",
      error: "Mangler TELNYX_API_KEY.",
    };
  }

  const userIds = options.userIds;
  const force = Boolean(options.force);

  const profilesRes = await listTelnyxOutboundVoiceProfiles({ apiKey });
  if (!profilesRes.ok || profilesRes.profiles.length === 0) {
    return {
      ok: false,
      code: "TELNYX_NO_OUTBOUND_VOICE_PROFILE",
      error: "Telnyx har ingen Outbound Voice Profile på kontoen.",
    };
  }
  const outboundVoiceProfileId = profilesRes.profiles[0].id;

  const where =
    userIds && userIds.length > 0
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

  const results: ProvisionAgentRowResult[] = [];

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

    const cc = await createTelnyxCredentialConnection({
      apiKey,
      name: connectionName,
      userName: sipUsername,
      tag: "allioagent",
      outboundVoiceProfileId,
    });
    if (!cc.ok) {
      results.push({
        userId: user.id,
        username: user.username,
        name: user.name,
        status: "failed",
        error: `Credential Connection: ${cc.message}`,
      });
      continue;
    }

    const tc = await createTelnyxTelephonyCredential({
      apiKey,
      connectionId: cc.connection.id,
      name: `Allio Agent ${user.name} (${user.username})`,
      tag: "allioagent",
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

  return { ok: true, summary, results };
}

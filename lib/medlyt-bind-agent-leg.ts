/**
 * Bind Telnyx call_control_id til AgentSession ud fra SIP-partier i webhooks.
 * Credential-connections understøtter ikke active_calls — Medlyt kræver derfor at vi
 * gemmer ben-id når Call Control ringer sælgerens SIP eller sælgeren ringer ud.
 */

import { prisma } from "@/lib/prisma";

function sipUserFromParty(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = raw.trim();
  const m = /^sip:([^@;>\s]+)/i.exec(t);
  if (m?.[1]) return m[1];
  // Bare sip-username uden scheme
  if (/^gencred/i.test(t) || /^allio/i.test(t)) return t.split("@")[0] ?? t;
  return null;
}

/** Opdater sælgers AgentSession med call_control_id når webhook-partier matcher deres SIP. */
export async function bindAgentSessionFromTelnyxParties(params: {
  callControlId: string;
  to?: unknown;
  from?: unknown;
}): Promise<void> {
  const cc = params.callControlId.trim();
  if (!cc) return;
  const toUser = sipUserFromParty(params.to);
  const fromUser = sipUserFromParty(params.from);
  const sipUsers = [...new Set([toUser, fromUser].filter(Boolean))] as string[];
  if (sipUsers.length === 0) return;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { telnyxCredentialSipUsername: { in: sipUsers } },
        { telnyxSipUsername: { in: sipUsers } },
      ],
    },
    select: { id: true },
  });
  if (!user) return;

  // Inbound til sælger (to = sip) eller outbound fra sælger-WebRTC — begge er «agent-ben» for Medlyt.
  await prisma.agentSession.updateMany({
    where: {
      userId: user.id,
      status: { in: ["ready", "ringing", "talking", "wrap_up", "draining", "paused"] },
    },
    data: {
      webRtcCallControlId: cc,
      currentAgentCallControlId: cc,
    },
  });
}

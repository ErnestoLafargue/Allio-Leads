import { prisma } from "@/lib/prisma";
import { getTelnyxCredentialInfo } from "@/lib/telnyx-call-control";

/**
 * Udfylder `User.telnyxCredentialConnectionId` ved første WebRTC-login el.l.
 * Bridge (`resolveAgentOutboundConnectionId`) bruger feltet først for at undgå
 * race/fejl ved gentagne GET /telephony_credentials under AMD-human.
 */
export async function ensureTelnyxCredentialConnectionIdCached(params: {
  userId: string;
  telephonyCredentialId: string;
  apiKey: string;
}): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { telnyxCredentialConnectionId: true, telnyxCredentialId: true },
  });
  if (!row?.telnyxCredentialId || row.telnyxCredentialId !== params.telephonyCredentialId) {
    return;
  }
  if (row.telnyxCredentialConnectionId?.trim()) {
    return;
  }

  const info = await getTelnyxCredentialInfo({
    apiKey: params.apiKey,
    telephonyCredentialId: params.telephonyCredentialId,
  });
  const cid = info.connectionId?.trim();
  if (!cid) {
    return;
  }

  await prisma.user.update({
    where: { id: params.userId },
    data: { telnyxCredentialConnectionId: cid },
  });
}

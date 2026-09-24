import { prisma } from "@/lib/prisma";
import {
  buildTelnyxAgentSipUri,
  getTelnyxCredentialInfo,
  patchTelnyxCredentialConnection,
} from "@/lib/telnyx-call-control";

export type PowerAgentTelnyxStatus = {
  ok: boolean;
  /** gencred…-brugernavnet browserens WebRTC registrerer sig som. */
  sipUsername: string | null;
  sipUriCallingEnabled: boolean;
  message?: string;
};

/**
 * Sørger for at en sælger kan ringes op af Power Dialer:
 * 1) telephony credentialets `sip_username` (gencred…) er kendt,
 * 2) SIP URI-opkald (`internal`) er slået til på sælgerens credential connection.
 * Kaldes når en Power-session starter (token-routen) og fra admin. Idempotent og cachet på User.
 */
export async function ensurePowerDialerAgentTelnyx(params: {
  userId: string;
  apiKey: string;
  force?: boolean;
}): Promise<PowerAgentTelnyxStatus> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      telnyxCredentialId: true,
      telnyxCredentialConnectionId: true,
      telnyxCredentialSipUsername: true,
      telnyxSipUriCallingEnabledAt: true,
    },
  });
  if (!user?.telnyxCredentialId) {
    return {
      ok: false,
      sipUsername: null,
      sipUriCallingEnabled: false,
      message: "Sælgeren har ingen personlig Telnyx-credential (provisionér under Administration → Telnyx).",
    };
  }

  let sipUsername = user.telnyxCredentialSipUsername?.trim() || null;
  let connectionId = user.telnyxCredentialConnectionId?.trim() || null;

  if (params.force || !sipUsername || !connectionId) {
    const info = await getTelnyxCredentialInfo({
      apiKey: params.apiKey,
      telephonyCredentialId: user.telnyxCredentialId,
    });
    if (!info.found) {
      return {
        ok: false,
        sipUsername,
        sipUriCallingEnabled: Boolean(user.telnyxSipUriCallingEnabledAt),
        message: `Kunne ikke hente Telnyx-credential: ${info.fetchError ?? "ukendt fejl"}`,
      };
    }
    sipUsername = info.sipUsername?.trim() || sipUsername;
    connectionId = info.connectionId?.trim() || connectionId;
    await prisma.user.update({
      where: { id: params.userId },
      data: {
        telnyxCredentialSipUsername: sipUsername,
        telnyxCredentialConnectionId: connectionId,
      },
    });
  }

  let sipUriCallingEnabled = Boolean(user.telnyxSipUriCallingEnabledAt);
  if ((params.force || !sipUriCallingEnabled) && connectionId) {
    const patched = await patchTelnyxCredentialConnection({
      apiKey: params.apiKey,
      connectionId,
      sipUriCallingPreference: "internal",
    });
    if (!patched.ok) {
      return {
        ok: false,
        sipUsername,
        sipUriCallingEnabled,
        message: `Kunne ikke slå SIP URI-opkald til på sælgerens Telnyx-forbindelse: ${patched.message}`,
      };
    }
    sipUriCallingEnabled = true;
    await prisma.user.update({
      where: { id: params.userId },
      data: { telnyxSipUriCallingEnabledAt: new Date() },
    });
  }

  return {
    ok: Boolean(sipUsername) && sipUriCallingEnabled,
    sipUsername,
    sipUriCallingEnabled,
    message: sipUsername ? undefined : "Telnyx returnerede intet SIP-brugernavn for credentialet.",
  };
}

/** SIP-URI Power Dialer ringer op: credentialets gencred…-navn, ellers forbindelsens brugernavn. */
export function powerAgentSipUri(user: {
  telnyxCredentialSipUsername: string | null;
  telnyxSipUsername: string | null;
}): string | null {
  const name = user.telnyxCredentialSipUsername?.trim() || user.telnyxSipUsername?.trim();
  return name ? buildTelnyxAgentSipUri(name) : null;
}

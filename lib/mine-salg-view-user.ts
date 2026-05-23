export type MineSalgViewUserResolveResult =
  | { ok: true; salesUserId: string }
  | { ok: false; status: 403 | 400; error: string };

/**
 * Bestemmer hvilken brugers Mine salg-data der må vises (kun læsning).
 * Admin kan se enhver eksisterende bruger; øvrige kun sig selv.
 */
export function resolveMineSalgSalesUserId(params: {
  sessionUserId: string;
  sessionRole: string;
  requestedUserId: string;
  requestedUserExists: boolean;
}): MineSalgViewUserResolveResult {
  const { sessionUserId, sessionRole, requestedUserId, requestedUserExists } = params;
  let salesUserId = sessionUserId;

  if (!requestedUserId) {
    return { ok: true, salesUserId };
  }

  if (sessionRole !== "ADMIN") {
    if (requestedUserId !== sessionUserId) {
      return {
        ok: false,
        status: 403,
        error: "Kun administrator kan se andres Mine salg.",
      };
    }
    return { ok: true, salesUserId: sessionUserId };
  }

  if (!requestedUserExists) {
    return { ok: false, status: 400, error: "Bruger findes ikke." };
  }

  salesUserId = requestedUserId;
  return { ok: true, salesUserId };
}

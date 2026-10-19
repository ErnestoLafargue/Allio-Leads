import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificér Allio-Native webhook-signatur.
 * Signed message = `{timestamp}.{rawBody}`
 * Key = SHA-256 hex digest af webhook-secret (whsec_…).
 */
export function verifyAllioNativeWebhookSignature(opts: {
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
  maxSkewSeconds?: number;
}): boolean {
  const { rawBody, timestamp, signature, secret } = opts;
  const maxSkew = opts.maxSkewSeconds ?? 300;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || !signature || !secret) return false;
  if (Math.abs(Date.now() / 1000 - ts) > maxSkew) return false;

  const key = createHash("sha256").update(secret).digest("hex");
  const expected =
    "sha256=" +
    createHmac("sha256", key).update(`${timestamp}.${rawBody}`).digest("hex");

  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Udtræk Telnyx call_control_id fra WebRTC SDK-call (forskellige SDK-felter over tid).
 */

export function telnyxCallControlIdFromSdkCall(call: unknown): string | null {
  if (!call || typeof call !== "object") return null;
  const c = call as Record<string, unknown>;
  const ids = c.telnyxIDs && typeof c.telnyxIDs === "object" ? (c.telnyxIDs as Record<string, unknown>) : null;
  const fromIds = typeof ids?.telnyxCallControlId === "string" ? ids.telnyxCallControlId.trim() : "";
  if (fromIds) return fromIds;
  const opts = c.options && typeof c.options === "object" ? (c.options as Record<string, unknown>) : null;
  const fromOpts = typeof opts?.telnyxCallControlId === "string" ? opts.telnyxCallControlId.trim() : "";
  if (fromOpts) return fromOpts;
  const direct = typeof c.telnyxCallControlId === "string" ? c.telnyxCallControlId.trim() : "";
  return direct || null;
}

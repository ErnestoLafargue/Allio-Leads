/** Delt auth for Podio-relaterede cron-endpoints. */
export function authorizePodioCron(req: Request): boolean {
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const authHeader = (req.headers.get("authorization") ?? "").trim();
  const podioSecret = (process.env.PODIO_WEBHOOK_SECRET ?? "").trim();
  const authSecret = (process.env.AUTH_SECRET ?? "").trim();
  return Boolean(
    (podioSecret && token === podioSecret) ||
      (authSecret && authHeader === `Bearer ${authSecret}`),
  );
}

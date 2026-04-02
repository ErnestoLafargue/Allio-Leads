/** Dansk visning uden sekunder: 02.04.2026 kl. 14:30 */
export function formatCallbackDa(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} kl. ${h}:${m}`;
}

/** Er tilbagekald aktivt og tidspunktet passeret? */
export function isCallbackOverdue(callbackAt: Date | string, status: string): boolean {
  if (String(status).toUpperCase() !== "PENDING") return false;
  const t = typeof callbackAt === "string" ? new Date(callbackAt) : callbackAt;
  return t.getTime() < Date.now();
}

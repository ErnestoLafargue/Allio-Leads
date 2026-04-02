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

/** København: gyldigt tidspunkt for planlagt tilbagekald 08:00–20:00 (inkl.). */
export function isCallbackTimeInCopenhagenBusinessWindow(d: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Copenhagen",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const t = hour * 60 + minute;
  return t >= 8 * 60 && t <= 20 * 60;
}

/** Er tilbagekald aktivt og tidspunktet passeret? */
export function isCallbackOverdue(callbackAt: Date | string, status: string): boolean {
  if (String(status).toUpperCase() !== "PENDING") return false;
  const t = typeof callbackAt === "string" ? new Date(callbackAt) : callbackAt;
  return t.getTime() < Date.now();
}

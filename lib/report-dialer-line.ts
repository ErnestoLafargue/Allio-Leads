import type { DialerLinePhase } from "@/lib/dialer-line-phase";

/** Best-effort: skriv linje-fase til serveren med det samme (klik-til-opkald / Power-telefon). */
export function reportDialerLineOccupancy(
  campaignId: string | null | undefined,
  phase: DialerLinePhase | null,
): void {
  const id = campaignId?.trim();
  if (!id) return;
  void fetch("/api/presence/line", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId: id, linePhase: phase }),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {
    /* linjetid er best-effort */
  });
}

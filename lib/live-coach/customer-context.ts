/**
 * Live-coachens «fornemmelse» af kunden: en kort profil af leadet (klinik, branche, by, noter) og
 * resuméer af tidligere samtaler med klinikken fra analyserne. Sendes med hvert AI-kald (i
 * brugerbeskeden, så den cachede systemprompt er uændret). Caches pr. lead i 5 minutter.
 */
import { prisma } from "@/lib/prisma";

export type CustomerFacts = {
  companyName: string;
  bookingSystem?: string;
  industry: string;
  city: string;
  campaign: string | null;
  notes: string;
  callbackNote: string;
  attempts: number;
  priorCalls: { date: Date; outcome: string | null; summary: string | null; nextStep: string | null }[];
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Ren formatering — kun felter med indhold kommer med. */
export function formatCustomerContext(f: CustomerFacts): string {
  const lines = [`Klinik: ${f.companyName}${f.industry ? ` (${f.industry})` : ""}${f.city ? `, ${f.city}` : ""}`];
  if (f.bookingSystem?.trim()) lines.push(`Bookingsystem: ${f.bookingSystem.trim()}`);
  if (f.campaign) lines.push(`Kampagne: ${f.campaign}`);
  if (f.attempts > 0) lines.push(`Tidligere forsøg uden svar: ${f.attempts}`);
  if (f.notes.trim()) lines.push(`Noter: ${clip(f.notes.trim().replace(/\s+/g, " "), 300)}`);
  if (f.callbackNote.trim()) lines.push(`Callback-note: ${clip(f.callbackNote.trim(), 200)}`);
  for (const c of f.priorCalls) {
    const date = c.date.toISOString().slice(0, 10);
    const parts = [c.outcome ? `udfald ${c.outcome}` : null, c.summary ? clip(c.summary, 220) : null, c.nextStep ? `næste skridt: ${c.nextStep}` : null];
    lines.push(`Samtale ${date}: ${parts.filter(Boolean).join(" · ")}`);
  }
  return lines.join("\n");
}

const cache = new Map<string, { at: number; text: string | null }>();
const TTL_MS = 5 * 60 * 1000;

export async function customerContext(leadId: string): Promise<string | null> {
  const hit = cache.get(leadId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      companyName: true,
      bookingSystem: true,
      industry: true,
      city: true,
      notes: true,
      callbackNote: true,
      unansweredAttempts: true,
      campaign: { select: { name: true } },
      callRecordings: {
        where: { analyses: { some: {} } },
        orderBy: { startedAt: "desc" },
        take: 3,
        select: {
          startedAt: true,
          outcomeStatus: true,
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { result: true } },
        },
      },
    },
  });
  const text = lead
    ? formatCustomerContext({
        companyName: lead.companyName,
        bookingSystem: lead.bookingSystem,
        industry: lead.industry,
        city: lead.city,
        campaign: lead.campaign?.name ?? null,
        notes: lead.notes,
        callbackNote: lead.callbackNote,
        attempts: lead.unansweredAttempts,
        priorCalls: lead.callRecordings.map((r) => {
          const a = r.analyses[0]?.result as { summary?: string; nextStep?: { type?: string; detail?: string } } | undefined;
          return {
            date: r.startedAt,
            outcome: r.outcomeStatus,
            summary: a?.summary ?? null,
            nextStep: a?.nextStep ? [a.nextStep.type, a.nextStep.detail].filter(Boolean).join(": ") : null,
          };
        }),
      })
    : null;
  cache.set(leadId, { at: Date.now(), text });
  return text;
}

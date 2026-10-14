/**
 * Den rensede citatbank: kundeindvendinger fra de analyserede samtaler, som er tydelige og kan forstås
 * alene eller med sælgerens replik lige før. scripts/rens-indvendinger.ts vurderer citaterne (Claude Haiku)
 * og skriver kun deres fingeraftryk + kategori til quote-bank-keep.json (ingen kundetekst i repoet).
 * Her bygges banken fra databasen ud fra den liste, så «Øv indvendinger» og «Træn Adrian» ikke viser
 * brudstykker og spørgsmål som indvendinger. Nye citater kommer med, når scriptet køres igen.
 */
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { prisma } from "@/lib/prisma";
import KEEP from "./quote-bank-keep.json";

export type BankQuote = {
  category: Exclude<ObjectionCategory, "other">;
  customerLine: string;
  /** Sælgerens replik lige før (højst ca. 200 tegn), så kortet giver mening. */
  agentBefore: string | null;
};

/** md5 af citatet med små bogstaver, første 12 tegn (samme som i scriptet). */
export const QUOTE_HASH_LENGTH = 12;

let cache: { at: number; quotes: BankQuote[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function loadQuoteBank(): Promise<BankQuote[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.quotes;
  const keep = KEEP as [string, string][];
  const quotes = await prisma.$queryRaw<BankQuote[]>`
    with keep(h, cat) as (select * from unnest(${keep.map((k) => k[0])}::text[], ${keep.map((k) => k[1])}::text[])),
    o as (
      select a."callRecordingId" rid, trim(x->'customer'->>'quote') q, (x->'customer'->>'seg')::int seg
      from "CallAnalysis" a, jsonb_array_elements(a.result->'objections') x
    ),
    d as (select distinct on (lower(q)) * from o where q is not null order by lower(q))
    select k.cat as category, d.q as "customerLine",
      (select right(s->>'text', 200) from jsonb_array_elements(t.segments) with ordinality e(s, i)
        where e.i - 1 < d.seg and s->>'speaker' <> 'customer' order by e.i desc limit 1) as "agentBefore"
    from d
    join keep k on k.h = left(md5(lower(d.q)), ${QUOTE_HASH_LENGTH})
    left join "CallTranscript" t on t."callRecordingId" = d.rid`;
  cache = { at: Date.now(), quotes };
  return quotes;
}

export function pickQuote(quotes: readonly BankQuote[], category: string, random = Math.random): BankQuote | null {
  const list = quotes.filter((q) => q.category === category);
  return list.length ? list[Math.floor(random() * list.length)]! : null;
}

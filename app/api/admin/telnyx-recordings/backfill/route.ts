import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { runRecordingsBackfill } from "@/lib/telnyx-recordings-backfill";

/**
 * POST /api/admin/telnyx-recordings/backfill
 *
 * Body (alle felter valgfri):
 *   {
 *     fromIso?: ISO-8601, kun optagelser >= dette tidspunkt
 *     toIso?:   ISO-8601, kun optagelser <= dette tidspunkt
 *     startPage?: int, side at starte fra (default 1) — admin kan kalde igen
 *                 med `nextPage` fra forrige svar for at fortsætte.
 *     pageSize?:  int (1–250), default 100
 *     maxPages?:  int (1–10), default 5  — sikring mod Vercel function-timeout
 *     dryRun?:    bool — opdaterer ikke databasen, returnerer kun statistik
 *     copyToBlob?: bool, default true — gem en kopi af lyden i Vercel Blob
 *   }
 *
 * Returnerer pr. kald: stats over hvor mange optagelser der blev fundet/oprettet
 * + `nextPage` (null når alle sider er gennemgået).
 */
export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Mangler TELNYX_API_KEY i miljøet." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        fromIso?: string;
        toIso?: string;
        startPage?: number;
        pageSize?: number;
        maxPages?: number;
        dryRun?: boolean;
        copyToBlob?: boolean;
      }
    | null;

  const startPage = Math.max(1, Math.floor(Number(body?.startPage) || 1));
  const pageSize = Math.min(250, Math.max(1, Math.floor(Number(body?.pageSize) || 100)));
  const maxPages = Math.min(10, Math.max(1, Math.floor(Number(body?.maxPages) || 5)));

  const fromIso = typeof body?.fromIso === "string" && body.fromIso.trim() ? body.fromIso.trim() : null;
  const toIso = typeof body?.toIso === "string" && body.toIso.trim() ? body.toIso.trim() : null;

  const dryRun = body?.dryRun === true;
  const copyToBlob = body?.copyToBlob !== false; // default true

  const out = await runRecordingsBackfill({
    apiKey,
    startPage,
    pageSize,
    maxPages,
    fromIso,
    toIso,
    dryRun,
    copyToBlob,
  });

  if (!out.ok) {
    return NextResponse.json(
      { ok: false, status: out.status, error: out.message },
      { status: out.status >= 400 && out.status < 600 ? out.status : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    copyToBlob,
    pageSize,
    startPage,
    pagesProcessed: out.result.pagesProcessed,
    nextPage: out.result.nextPage,
    totalPages: out.result.totalPages,
    stats: out.result.stats,
  });
}

/**
 * Vercel-funktion: 60 sek er rigeligt til 5 sider × 100 = 500 optagelser
 * (de fleste tager < 100 ms hvis vi ikke kopierer til Blob, ~1-2 s hvis vi gør).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

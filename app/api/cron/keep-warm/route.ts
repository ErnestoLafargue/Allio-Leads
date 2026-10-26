import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Holder Neon + en serverless-instans vågen, så første åbning af Start-siden
 * ikke venter på compute-resume. Vercel cron sender `x-vercel-cron: 1`.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const expected = process.env.CRON_SECRET?.trim() ?? "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const authorizedBySecret = Boolean(expected) && auth === `Bearer ${expected}`;
  if (!isVercelCron && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return NextResponse.json({ ok: true, dbMs: Date.now() - started });
}

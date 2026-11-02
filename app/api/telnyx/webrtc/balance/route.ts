import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { fetchTelnyxBalanceExhausted } from "@/lib/telnyx-balance";

/** Kaldes når et opkald fejler: er Telnyx-saldoen brugt op? (Beløbet sendes ikke til klienten.) */
export async function GET() {
  const { response } = await requireSession();
  if (response) return response;
  return NextResponse.json({ exhausted: await fetchTelnyxBalanceExhausted() });
}

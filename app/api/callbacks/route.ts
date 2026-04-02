import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

const leadInclude = {
  campaign: { select: { id: true, name: true } },
  callbackReservedByUser: { select: { id: true, name: true, username: true } },
  callbackCreatedByUser: { select: { id: true, name: true, username: true } },
} as const;

/**
 * Aktive tilbagekald (CALLBACK_SCHEDULED + PENDING).
 * Standard: kun tildelt til den loggede bruger. Admin kan ?forUserId= for at se en andens.
 */
export async function GET(req: Request) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const forUserId =
    session.user.role === "ADMIN" && searchParams.get("forUserId")?.trim()
      ? searchParams.get("forUserId")!.trim()
      : session.user.id;

  try {
    const leads = await prisma.lead.findMany({
      where: {
        status: "CALLBACK_SCHEDULED",
        callbackStatus: "PENDING",
        callbackReservedByUserId: forUserId,
      },
      orderBy: { callbackScheduledFor: "asc" },
      include: leadInclude,
    });

    return NextResponse.json(leads);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      msg.includes("callbackStatus") ||
      msg.includes("callbackNote") ||
      msg.includes("callbackCreatedByUserId") ||
      msg.toLowerCase().includes("does not exist");
    return NextResponse.json(
      {
        error: hint
          ? "Kør «npx prisma migrate deploy» — manglende tilbagekald-felter i databasen."
          : "Kunne ikke hente tilbagekald.",
      },
      { status: 500 },
    );
  }
}

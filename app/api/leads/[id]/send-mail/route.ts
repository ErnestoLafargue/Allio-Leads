import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";

type Params = { params: Promise<{ id: string }> };

function envOrEmpty(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function parseSmtpPort(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function parseSecure(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function POST(req: Request, { params }: Params) {
  const { session, response } = await requireSession();
  if (response) return response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!to) {
    return NextResponse.json({ error: "Manglende modtager (Til)." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Ugyldig modtager-e-mail." }, { status: 400 });
  }
  if (!subject) {
    return NextResponse.json({ error: "Skriv et emne." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "Skriv en besked." }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      bookedByUserId: true,
      callbackReservedByUserId: true,
      companyName: true,
    },
  });
  if (!lead) return NextResponse.json({ error: "Lead ikke fundet." }, { status: 404 });

  if (!canAccessBookedMeetingNotes(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Ingen adgang til at sende mail for dette lead." }, { status: 403 });
  }
  if (!canAccessCallbackLead(session.user.role, session.user.id, lead)) {
    return NextResponse.json({ error: "Lead er reserveret til en anden sælger." }, { status: 403 });
  }

  const host = envOrEmpty("SMTP_HOST");
  const portRaw = envOrEmpty("SMTP_PORT");
  const secureRaw = envOrEmpty("SMTP_SECURE");
  const user = envOrEmpty("SMTP_USER");
  const pass = envOrEmpty("SMTP_PASS");
  const from = envOrEmpty("MAIL_FROM") || "hej@allio.dk";
  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: "SMTP er ikke konfigureret korrekt (host/bruger/adgangskode mangler)." },
      { status: 500 },
    );
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseSmtpPort(portRaw),
      secure: parseSecure(secureRaw),
      auth: { user, pass },
      requireTLS: !parseSecure(secureRaw),
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text: message,
    });

    return NextResponse.json({ ok: true, to, subject, leadId: lead.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: "Kunne ikke sende mail.",
        details: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 500 },
    );
  }
}

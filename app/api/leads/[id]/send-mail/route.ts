import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";
import { canAccessBookedMeetingNotes } from "@/lib/lead-meeting-access";
import { canAccessCallbackLead } from "@/lib/lead-callback-access";
import { embedInlineImages, htmlToPlainText } from "@/lib/mail-send/prepare-outgoing-mail";

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

function extractEmailAddress(v: string): string {
  const m = v.match(/<([^>]+)>/);
  return (m?.[1] ?? v).trim();
}

function parseRecipientList(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function looksLikeHtml(v: string): boolean {
  return /<html|<body|<table|<div|<p|<a\s/i.test(v);
}

async function appendToSentMailbox(args: {
  rawMessage: Buffer;
  defaultMailboxName?: string;
  smtpUser: string;
  smtpPass: string;
}) {
  const imapHost = envOrEmpty("IMAP_HOST") || "mail.simply.com";
  const imapPort = parseSmtpPort(envOrEmpty("IMAP_PORT") || "143");
  const imapSecure = parseSecure(envOrEmpty("IMAP_SECURE"));
  const imapUser = envOrEmpty("IMAP_USER") || args.smtpUser;
  const imapPass = envOrEmpty("IMAP_PASS") || args.smtpPass;
  const preferredMailbox = envOrEmpty("IMAP_SENT_MAILBOX") || args.defaultMailboxName || "Sent";

  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: imapSecure,
    auth: { user: imapUser, pass: imapPass },
    logger: false,
  });

  await client.connect();
  try {
    const mailboxCandidates = (await client.list())
      .map((box) => box.path)
      .filter((path): path is string => Boolean(path));

    const preferred = mailboxCandidates.find((name) => name === preferredMailbox);
    const fallback =
      mailboxCandidates.find((name) => /(^|[\/. ])sent$/i.test(name)) ??
      mailboxCandidates.find((name) => /sendt/i.test(name));
    const targetMailbox = preferred ?? fallback ?? preferredMailbox;

    await client.mailboxOpen(targetMailbox);
    await client.append(targetMailbox, args.rawMessage, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => {});
  }
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
  const fromAddress = extractEmailAddress(from);
  /** Samme afsender som Reply-To, så «Svar» altid rammer hej@allio.dk (også ved multipart HTML). */
  const mailIdentity = { name: "Allio", address: fromAddress };
  const toRecipients = parseRecipientList(to);
  if (!host || !user || !pass) {
    return NextResponse.json(
      { error: "SMTP er ikke konfigureret korrekt (host/bruger/adgangskode mangler)." },
      { status: 500 },
    );
  }

  try {
    const fromDomain = fromAddress.split("@")[1] || "allio.dk";
    const transporter = nodemailer.createTransport({
      host,
      port: parseSmtpPort(portRaw),
      secure: parseSecure(secureRaw),
      auth: { user, pass },
      requireTLS: !parseSecure(secureRaw),
      /** EHLO-navn: standard er serverens hostname (fx en Vercel-container), som ser mistænkeligt ud. */
      name: fromDomain,
    });

    const isHtml = looksLikeHtml(message);
    const inline = isHtml ? embedInlineImages(message) : { html: message, attachments: [] };
    let textPart = isHtml ? htmlToPlainText(message) : message;
    if (isHtml && textPart.trim().length === 0) {
      textPart =
        "Allio har sendt dig en HTML-mail. Åbn den i din mailapp for at se layout og links.";
    }

    const mailInput = {
      from: mailIdentity,
      /** Ikke sæt `sender` — det kan få nogle klienter til at foreslå forkert svar-adresse. */
      replyTo: mailIdentity,
      to,
      subject,
      text: textPart,
      html: isHtml ? inline.html : undefined,
      attachments: inline.attachments,
      messageId: `<${crypto.randomUUID()}@${fromDomain}>`,
      date: new Date(),
      headers: {
        "List-Unsubscribe": `<mailto:${fromAddress}?subject=Afmeld>`,
      },
    };

    /** Byg mailen én gang, så den sendte og den gemte i «Sendt» er identiske (samme Message-ID). */
    const rawMessage = await new Promise<Buffer>((resolve, reject) => {
      const composer = new MailComposer(mailInput);
      composer.compile().build((err, msg) => {
        if (err) return reject(err);
        resolve(msg);
      });
    });
    await transporter.sendMail({ envelope: { from: fromAddress, to: toRecipients }, raw: rawMessage });

    /** Mailen er sendt — en fejl her må ikke give «Kunne ikke sende» og føre til dobbelte mails. */
    await appendToSentMailbox({
      rawMessage,
      smtpUser: user,
      smtpPass: pass,
      defaultMailboxName: "Sent",
    }).catch((e) => console.error("appendToSentMailbox", e));

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

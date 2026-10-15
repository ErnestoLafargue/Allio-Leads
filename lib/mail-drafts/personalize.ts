/** Pladsholdere i mailudkast, som udfyldes ud fra lead og indlogget bruger. */
export const MAIL_PLACEHOLDERS = {
  greeting: "{{HILSEN}}",
  companyName: "{{KLINIKNAVN}}",
  senderName: "{{AFSENDER_NAVN}}",
  senderEmail: "{{AFSENDER_EMAIL}}",
} as const;

export type MailSenderUser = {
  name?: string | null;
  /** Session-mail er `${username}@local` (se auth.ts). */
  email?: string | null;
};

export type MailDraftContext = {
  /** "Navn på person til mødet" på leadet. */
  contactName?: string;
  /** "Virksomhedsnavn" på leadet. */
  companyName?: string;
  sender?: MailSenderUser | null;
};

const ERNESTO_FULL_NAME = "Ernesto Frank Lafargue";
const ERNESTO_EMAIL = "ernesto@allio.dk";
const SHARED_EMAIL = "hej@allio.dk";

function normalizeIdentity(v: string | null | undefined): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-zæøå0-9]/g, "");
}

function senderIdentities(sender: MailSenderUser | null | undefined): string[] {
  const username = String(sender?.email ?? "").split("@")[0];
  return [normalizeIdentity(sender?.name), normalizeIdentity(username)].filter(Boolean);
}

function matchesAny(sender: MailSenderUser | null | undefined, ids: string[]): boolean {
  return senderIdentities(sender).some((v) => ids.includes(v) || v.startsWith("ernesto"));
}

/** Ernesto og Admin 1 underskriver med Ernestos fulde navn; alle andre med deres skærmnavn. */
export function mailSenderName(sender: MailSenderUser | null | undefined): string {
  if (matchesAny(sender, ["ernesto", "admin1"])) return ERNESTO_FULL_NAME;
  return sender?.name?.trim() || "Allio";
}

/** ernesto@allio.dk vises kun for Ernesto, Admin og Admin 1 — ellers hej@allio.dk. */
export function mailSenderEmail(sender: MailSenderUser | null | undefined): string {
  return matchesAny(sender, ["ernesto", "admin", "admin1"]) ? ERNESTO_EMAIL : SHARED_EMAIL;
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function personalizeMailDraft(message: string, ctx: MailDraftContext): string {
  const contactName = ctx.contactName?.trim() ?? "";
  const companyName = ctx.companyName?.trim() ?? "";
  const values: Record<string, string> = {
    [MAIL_PLACEHOLDERS.greeting]: contactName ? `Hej ${escapeHtml(contactName)},` : "Hej,",
    [MAIL_PLACEHOLDERS.companyName]: companyName ? escapeHtml(companyName) : "jeres klinik",
    [MAIL_PLACEHOLDERS.senderName]: escapeHtml(mailSenderName(ctx.sender)),
    [MAIL_PLACEHOLDERS.senderEmail]: mailSenderEmail(ctx.sender),
  };
  let out = message;
  for (const [placeholder, value] of Object.entries(values)) {
    out = out.split(placeholder).join(value);
  }
  return out;
}

import { ALLIO_LOGO_PNG_BASE64 } from "@/lib/mail-drafts/allio-logo-inline";
import { ALLIO_LOGO_PUBLIC_URL } from "@/lib/mail-drafts/client-edition-mail";

export const ALLIO_LOGO_CID = "allio-logo@allio.dk";

type InlineAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
  contentDisposition: "inline";
};

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aelig: "æ",
  AElig: "Æ",
  oslash: "ø",
  Oslash: "Ø",
  aring: "å",
  Aring: "Å",
  eacute: "é",
  rarr: "→",
  larr: "←",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  middot: "·",
  copy: "©",
};

function decodeEntities(v: string): string {
  return v
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name] ?? m);
}

/**
 * Læsbar tekstversion af en HTML-mail. Spamfiltre sammenligner text- og html-delen,
 * så teksten skal ligne det modtageren ser — uden <head>, kommentarer og CSS-rester.
 */
export function htmlToPlainText(html: string): string {
  const text = html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (/^mailto:|^tel:/i.test(href) || !l) return l;
      return l.includes(href.replace(/^https?:\/\//, "")) ? href : `${l} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Logoet vedhæftes inline (cid) i stedet for at hentes fra vercel.app: eksterne billeder
 * blokeres ofte, og delte domæner som vercel.app trækker spam-scoren op.
 */
export function embedInlineImages(html: string): { html: string; attachments: InlineAttachment[] } {
  if (!html.includes(ALLIO_LOGO_PUBLIC_URL)) return { html, attachments: [] };
  return {
    html: html.split(ALLIO_LOGO_PUBLIC_URL).join(`cid:${ALLIO_LOGO_CID}`),
    attachments: [
      {
        filename: "allio-logo.png",
        content: Buffer.from(ALLIO_LOGO_PNG_BASE64, "base64"),
        contentType: "image/png",
        cid: ALLIO_LOGO_CID,
        contentDisposition: "inline",
      },
    ],
  };
}

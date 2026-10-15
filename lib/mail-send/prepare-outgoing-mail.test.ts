import { describe, expect, it } from "vitest";
import MailComposer from "nodemailer/lib/mail-composer";
import { CLIENT_EDITION_MESSAGE } from "@/lib/mail-drafts/client-edition-mail";
import { personalizeMailDraft } from "@/lib/mail-drafts/personalize";
import { ALLIO_LOGO_CID, embedInlineImages, htmlToPlainText } from "./prepare-outgoing-mail";

const html = personalizeMailDraft(CLIENT_EDITION_MESSAGE, {
  contactName: "Sofie",
  companyName: "Klinik Glow",
  sender: { name: "Ernesto", email: "ernesto@local" },
});

describe("embedInlineImages", () => {
  it("erstatter den eksterne logo-URL med et inline cid-billede", () => {
    const out = embedInlineImages(html);
    expect(out.html).toContain(`src="cid:${ALLIO_LOGO_CID}"`);
    expect(out.html).not.toContain("vercel.app");
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments[0].content.subarray(1, 4).toString()).toBe("PNG");
  });

  it("rører ikke mails uden logoet", () => {
    expect(embedInlineImages("<p>Hej</p>")).toEqual({ html: "<p>Hej</p>", attachments: [] });
  });
});

describe("htmlToPlainText", () => {
  it("giver en ren tekstversion uden head, CSS eller entities", () => {
    const text = htmlToPlainText(html);
    expect(text).not.toMatch(/@media|<|&nbsp;|&amp;|Allio – Mere værdi/);
    expect(text).toContain("Hej Sofie,");
    expect(text).toContain("Aftal en uforpligtende gennemgang → (https://calendar.app.google/pojTzzLC2h3qXB56A)");
    expect(text).toContain("Ernesto Frank Lafargue");
  });
});

describe("færdig MIME-mail", () => {
  it("har related-del med inline logo", async () => {
    const inline = embedInlineImages(html);
    const raw = await new Promise<Buffer>((resolve, reject) =>
      new MailComposer({
        from: { name: "Allio", address: "hej@allio.dk" },
        to: "test@example.com",
        subject: "Test",
        text: htmlToPlainText(html),
        html: inline.html,
        attachments: inline.attachments,
      })
        .compile()
        .build((err, msg) => (err ? reject(err) : resolve(msg))),
    );
    const s = raw.toString();
    expect(s).toContain("multipart/related");
    expect(s).toContain(`Content-ID: <${ALLIO_LOGO_CID}>`);
    expect(s).toContain("Content-Disposition: inline");
  });
});

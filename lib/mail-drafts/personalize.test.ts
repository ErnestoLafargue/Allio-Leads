import { describe, expect, it } from "vitest";
import { CLIENT_EDITION_MESSAGE } from "./client-edition-mail";
import { mailSenderEmail, mailSenderName, personalizeMailDraft } from "./personalize";

describe("mail-afsender", () => {
  it("Ernesto og Admin 1 underskriver med fulde navn og ernesto@allio.dk", () => {
    for (const sender of [
      { name: "Ernesto", email: "ernesto@local" },
      { name: "Admin 1", email: "admin1@local" },
    ]) {
      expect(mailSenderName(sender)).toBe("Ernesto Frank Lafargue");
      expect(mailSenderEmail(sender)).toBe("ernesto@allio.dk");
    }
  });

  it("Admin får ernesto@allio.dk men beholder sit skærmnavn", () => {
    const sender = { name: "Admin", email: "admin@local" };
    expect(mailSenderName(sender)).toBe("Admin");
    expect(mailSenderEmail(sender)).toBe("ernesto@allio.dk");
  });

  it("andre brugere får skærmnavn og hej@allio.dk", () => {
    const sender = { name: "Mads Jensen", email: "mads@local" };
    expect(mailSenderName(sender)).toBe("Mads Jensen");
    expect(mailSenderEmail(sender)).toBe("hej@allio.dk");
  });
});

describe("personalizeMailDraft", () => {
  it("udfylder kontaktnavn, kliniknavn og afsender", () => {
    const html = personalizeMailDraft(CLIENT_EDITION_MESSAGE, {
      contactName: "Sofie",
      companyName: "Klinik <Glow>",
      sender: { name: "Mads Jensen", email: "mads@local" },
    });
    expect(html).toContain("Hej Sofie,");
    expect(html).toContain("<strong>Klinik &lt;Glow&gt;</strong>");
    expect(html).toContain("Mads Jensen");
    expect(html).toContain("mailto:hej@allio.dk");
    expect(html).toContain('href="https://calendar.app.google/pojTzzLC2h3qXB56A"');
    expect(html).not.toContain("ernesto@allio.dk");
    expect(html).not.toContain("{{");
  });

  it("falder tilbage når felter er tomme", () => {
    const html = personalizeMailDraft(CLIENT_EDITION_MESSAGE, {});
    expect(html).toContain("Hej,");
    expect(html).toContain("<strong>jeres klinik</strong>");
  });
});

describe("Klinik vækst mail", () => {
  it("indsætter bookingsystemet fra leadet", async () => {
    const { GROWTH_OVERVIEW_MESSAGE } = await import("./growth-overview-mail");
    const html = personalizeMailDraft(GROWTH_OVERVIEW_MESSAGE, {
      contactName: "Sofie",
      companyName: "Klinik Glow",
      bookingSystem: "Gecko Booking",
      sender: { name: "Mads Jensen", email: "mads@local" },
    });
    expect(html).toContain("integreres direkte med Gecko Booking,");
    expect(html).toContain("Hej Sofie,");
    expect(html).toContain("mailto:hej@allio.dk");
    expect(html).not.toContain("{{");
  });

  it("falder tilbage til «jeres bookingsystem»", async () => {
    const { GROWTH_OVERVIEW_MESSAGE } = await import("./growth-overview-mail");
    const html = personalizeMailDraft(GROWTH_OVERVIEW_MESSAGE, {});
    expect(html).toContain("integreres direkte med jeres bookingsystem,");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignVoipStrip } from "@/app/components/campaign-voip-strip";
import { dialNumberMenu } from "@/lib/lead-phones";

function markup(phone: string, privatePhone: string | null) {
  const menu = dialNumberMenu(phone, privatePhone, "COMPANY_FIRST");
  return renderToStaticMarkup(
    createElement(CampaignVoipStrip, {
      leadId: "lead-a",
      campaignId: "camp-a",
      leadPhone: menu[0]?.raw ?? "",
      failoverPhone: menu[1]?.raw ?? "",
      dialMenu: menu,
      dialMode: "PREDICTIVE",
      autoStartCall: false,
    }),
  );
}

describe("opkaldsfelt med to numre", () => {
  it("viser virksomhed og privat i samme felt som en rullemenu", () => {
    const html = markup("+4536179018", "22112211");
    expect(html).toContain("<select");
    expect(html).not.toContain("<select disabled");
    expect(html).toContain("Virksomhed · +4536179018");
    expect(html).toContain("Privat · 22112211");
    expect(html).toContain('aria-label="Vælg telefonnummer"');
    expect(html).not.toContain('placeholder="Nummer til opkald"');
  });

  it("lader feltet være et almindeligt nummer, når der kun er ét", () => {
    const html = markup("+4536179018", null);
    expect(html).not.toContain("<select");
    expect(html).toContain('value="+4536179018"');
  });
});

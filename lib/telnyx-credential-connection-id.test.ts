import { describe, expect, it } from "vitest";
import { connectionIdFromTelnyxCredentialData } from "@/lib/telnyx-call-control";

describe("connectionIdFromTelnyxCredentialData", () => {
  it("læser resource_id connection:… fra GET telephony_credentials", () => {
    expect(
      connectionIdFromTelnyxCredentialData({
        resource_id: "connection:804252963366242252",
        sip_username: "gencredExample",
      }),
    ).toBe("804252963366242252");
  });

  it("foretrækker connection_id når det findes", () => {
    expect(
      connectionIdFromTelnyxCredentialData({
        connection_id: "111",
        resource_id: "connection:222",
      }),
    ).toBe("111");
  });
});

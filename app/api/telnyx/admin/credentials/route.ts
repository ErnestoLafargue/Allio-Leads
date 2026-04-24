import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  createTelnyxTelephonyCredential,
  getTelnyxConnectionId,
  getTelnyxTelephonyCredentialId,
  listTelnyxCredentials,
} from "@/lib/telnyx-call-control";

type PostBody = {
  connectionId?: string;
  name?: string;
  expiresAt?: string | null;
};

function configuredCredentialHint(): string | null {
  const id = getTelnyxTelephonyCredentialId();
  if (!id) return null;
  return id.length > 4 ? `…${id.slice(-4)}` : id;
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: "TELNYX_NOT_CONFIGURED", error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }

  const connectionId = getTelnyxConnectionId();
  const currentCredentialId = getTelnyxTelephonyCredentialId();

  const list = await listTelnyxCredentials({ apiKey });
  if (!list.ok) {
    return NextResponse.json(
      {
        code: "TELNYX_LIST_FAILED",
        error: list.message,
        telnyxStatus: list.status,
        connectionId,
        currentCredentialIdHint: configuredCredentialHint(),
      },
      { status: list.status >= 500 ? 502 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    credentials: list.credentials,
    connectionId,
    currentCredentialId,
    currentCredentialIdHint: configuredCredentialHint(),
  });
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: "TELNYX_NOT_CONFIGURED", error: "Mangler TELNYX_API_KEY." },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as PostBody | null;
  const envConnectionId = getTelnyxConnectionId();
  const connectionId = body?.connectionId?.trim() || envConnectionId || "";
  if (!connectionId) {
    return NextResponse.json(
      {
        code: "TELNYX_CONNECTION_ID_MISSING",
        error:
          "Mangler TELNYX_CONNECTION_ID (eller TELNYX_APPLICATION_ID). Sæt den i Vercel eller angiv connectionId i kaldet.",
      },
      { status: 400 },
    );
  }

  const name = body?.name?.trim() || defaultCredentialName();
  const expiresAt =
    typeof body?.expiresAt === "string" && body.expiresAt.trim()
      ? body.expiresAt.trim()
      : defaultExpiresAtIso();

  const created = await createTelnyxTelephonyCredential({
    apiKey,
    connectionId,
    name,
    tag: "allio-leads-webrtc",
    expiresAtIso: expiresAt,
  });
  if (!created.ok) {
    console.error("[telnyx:admin] create credential failed", {
      status: created.status,
      message: created.message,
      telnyx: created.telnyx,
    });
    return NextResponse.json(
      {
        code: "TELNYX_CREATE_CREDENTIAL_FAILED",
        error: created.message,
        telnyxStatus: created.status,
      },
      { status: created.status >= 500 ? 502 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    credential: created.credential,
    connectionId,
  });
}

function defaultCredentialName(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `Allio Leads WebRTC ${stamp} UTC`;
}

function defaultExpiresAtIso(): string {
  // 10 år frem — effektivt "aldrig" for denne app.
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 10);
  return d.toISOString();
}

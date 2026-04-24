import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import {
  createTelnyxCredentialConnection,
  createTelnyxTelephonyCredential,
  getTelnyxConnectionId,
  getTelnyxTelephonyCredentialId,
  listTelnyxCredentialConnections,
  listTelnyxCredentials,
  type TelnyxCredentialConnection,
} from "@/lib/telnyx-call-control";

type PostBody = {
  credentialConnectionId?: string;
  name?: string;
  expiresAt?: string | null;
};

const ALLIO_WEBRTC_NAME = "allio-leads-webrtc";
const ALLIO_WEBRTC_TAG = "allio-leads-webrtc";

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

  const voiceApiApplicationId = getTelnyxConnectionId();
  const currentCredentialId = getTelnyxTelephonyCredentialId();

  const list = await listTelnyxCredentials({ apiKey });

  // Find den Credential Connection vi plejer at bruge.
  const ccList = await listTelnyxCredentialConnections({
    apiKey,
    nameContains: ALLIO_WEBRTC_NAME,
  });
  const allioConnection = ccList.ok
    ? ccList.connections.find((c) => c.name === ALLIO_WEBRTC_NAME) ?? ccList.connections[0] ?? null
    : null;

  if (!list.ok) {
    return NextResponse.json(
      {
        code: "TELNYX_LIST_FAILED",
        error: list.message,
        telnyxStatus: list.status,
        voiceApiApplicationId,
        allioCredentialConnectionId: allioConnection?.id ?? null,
        currentCredentialIdHint: configuredCredentialHint(),
      },
      { status: list.status >= 500 ? 502 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    credentials: list.credentials,
    voiceApiApplicationId,
    allioCredentialConnectionId: allioConnection?.id ?? null,
    allioCredentialConnectionName: allioConnection?.name ?? null,
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

  // Trin 1: Find eller opret en Credential Connection dedikeret til WebRTC.
  let connection: TelnyxCredentialConnection | null = null;
  const providedConnectionId = body?.credentialConnectionId?.trim();

  if (providedConnectionId) {
    connection = { id: providedConnectionId, name: null, userName: null, active: null, tags: [], createdAt: null };
  } else {
    const existing = await listTelnyxCredentialConnections({
      apiKey,
      nameContains: ALLIO_WEBRTC_NAME,
    });
    if (!existing.ok) {
      console.error("[telnyx:admin] list credential connections failed", existing);
      return NextResponse.json(
        {
          code: "TELNYX_LIST_CC_FAILED",
          error: `Kunne ikke liste credential connections: ${existing.message}`,
          telnyxStatus: existing.status,
        },
        { status: existing.status >= 500 ? 502 : 400 },
      );
    }
    connection =
      existing.connections.find((c) => c.name === ALLIO_WEBRTC_NAME) ??
      existing.connections[0] ??
      null;

    if (!connection) {
      const createdCc = await createTelnyxCredentialConnection({
        apiKey,
        name: ALLIO_WEBRTC_NAME,
        tag: ALLIO_WEBRTC_TAG,
      });
      if (!createdCc.ok) {
        console.error("[telnyx:admin] create credential connection failed", createdCc);
        return NextResponse.json(
          {
            code: "TELNYX_CREATE_CC_FAILED",
            error: `Kunne ikke oprette Credential Connection: ${createdCc.message}`,
            telnyxStatus: createdCc.status,
          },
          { status: createdCc.status >= 500 ? 502 : 400 },
        );
      }
      connection = createdCc.connection;
    }
  }

  // Trin 2: Opret Telephony Credential linket til Credential Connection.
  const name = body?.name?.trim() || defaultCredentialName();
  const expiresAt =
    typeof body?.expiresAt === "string" && body.expiresAt.trim()
      ? body.expiresAt.trim()
      : null;

  const created = await createTelnyxTelephonyCredential({
    apiKey,
    connectionId: connection.id,
    name,
    tag: ALLIO_WEBRTC_TAG,
    expiresAtIso: expiresAt,
  });
  if (!created.ok) {
    console.error("[telnyx:admin] create telephony credential failed", {
      status: created.status,
      message: created.message,
      telnyx: created.telnyx,
      connectionId: connection.id,
    });
    return NextResponse.json(
      {
        code: "TELNYX_CREATE_CREDENTIAL_FAILED",
        error: created.message,
        telnyxStatus: created.status,
        credentialConnectionId: connection.id,
      },
      { status: created.status >= 500 ? 502 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    credential: created.credential,
    credentialConnectionId: connection.id,
    credentialConnectionName: connection.name,
  });
}

function defaultCredentialName(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `Allio Leads WebRTC ${stamp} UTC`;
}

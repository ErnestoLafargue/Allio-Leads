import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    return { session: null, response: NextResponse.json({ error: "Ikke logget ind" }, { status: 401 }) };
  }
  return { session, response: null as null };
}

export async function requireAdmin() {
  const r = await requireSession();
  if (r.response) return r;
  if (r.session!.user.role !== "ADMIN") {
    return {
      session: null,
      response: NextResponse.json({ error: "Kun administrator" }, { status: 403 }),
    };
  }
  return { session: r.session, response: null as null };
}

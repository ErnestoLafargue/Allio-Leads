import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";

export async function POST() {
  const { response } = await requireSession();
  if (response) return response;
  return NextResponse.json(
    { error: "Masssletning af leads er deaktiveret." },
    { status: 403 },
  );
}

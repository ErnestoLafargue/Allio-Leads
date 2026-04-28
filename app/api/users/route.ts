import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

export async function GET() {
  const { session, response } = await requireAdmin();
  if (response) return response;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role === "ADMIN" ? "ADMIN" : "SELLER";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  const normalizedPhone = phone ? normalizePhoneToE164ForDial(phone) : null;

  if (!username || !name || password.length < 6) {
    return NextResponse.json(
      { error: "Brugernavn, navn og adgangskode (min. 6 tegn) er påkrævet" },
      { status: 400 },
    );
  }
  if (phone && !normalizedPhone) {
    return NextResponse.json({ error: "Telefonnummer er ugyldigt. Brug fx +45xxxxxxxx." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json({ error: "Brugernavnet findes allerede" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, name, passwordHash, role, phone: normalizedPhone },
    select: { id: true, username: true, name: true, phone: true, role: true, createdAt: true },
  });

  return NextResponse.json(user);
}

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { normalizePhoneToE164ForDial } from "@/lib/phone-e164";

type Params = { params: Promise<{ id: string }> };

const selectPublic = {
  id: true,
  username: true,
  name: true,
  phone: true,
  role: true,
  createdAt: true,
} as const;

export async function PATCH(req: Request, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const usernameRaw = typeof body?.username === "string" ? body.username.trim().toLowerCase() : undefined;
  const nameRaw = typeof body?.name === "string" ? body.name.trim() : undefined;
  const passwordRaw = typeof body?.password === "string" ? body.password : undefined;
  const phoneRaw = typeof body?.phone === "string" ? body.phone.trim() : undefined;
  const roleBody = body?.role === "ADMIN" || body?.role === "SELLER" ? body.role : undefined;

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Bruger ikke fundet" }, { status: 404 });
  }

  const hasUsername = usernameRaw !== undefined;
  const hasName = nameRaw !== undefined;
  const hasPassword = passwordRaw !== undefined && passwordRaw.length > 0;
  const nextRole = roleBody ?? existing.role;
  const roleChanged = roleBody !== undefined && roleBody !== existing.role;

  const hasPhone = phoneRaw !== undefined;
  const normalizedPhone = hasPhone ? (phoneRaw ? normalizePhoneToE164ForDial(phoneRaw) : null) : undefined;

  if (!hasUsername && !hasName && !hasPassword && !roleChanged && !hasPhone) {
    return NextResponse.json({ error: "Intet at opdatere" }, { status: 400 });
  }
  if (hasPhone && phoneRaw && !normalizedPhone) {
    return NextResponse.json({ error: "Telefonnummer er ugyldigt. Brug fx +45xxxxxxxx." }, { status: 400 });
  }

  if (roleChanged && existing.role === "ADMIN" && nextRole === "SELLER") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Den sidste administrator kan ikke sættes til sælger." },
        { status: 400 },
      );
    }
  }

  const nextUsername = hasUsername ? usernameRaw! : existing.username;
  const nextName = hasName ? nameRaw! : existing.name;

  if (!nextUsername) {
    return NextResponse.json({ error: "Brugernavn må ikke være tomt" }, { status: 400 });
  }
  if (!nextName) {
    return NextResponse.json({ error: "Profilnavn må ikke være tomt" }, { status: 400 });
  }

  if (hasUsername && nextUsername !== existing.username) {
    const clash = await prisma.user.findUnique({ where: { username: nextUsername } });
    if (clash) {
      return NextResponse.json({ error: "Brugernavnet er allerede i brug" }, { status: 409 });
    }
  }

  let passwordHash: string | undefined;
  if (hasPassword) {
    if (passwordRaw!.length < 6) {
      return NextResponse.json({ error: "Adgangskode skal være mindst 6 tegn" }, { status: 400 });
    }
    passwordHash = await bcrypt.hash(passwordRaw!, 12);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(hasUsername ? { username: nextUsername } : {}),
      ...(hasName ? { name: nextName } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(roleChanged ? { role: nextRole } : {}),
      ...(hasPhone ? { phone: normalizedPhone ?? null } : {}),
    },
    select: selectPublic,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;
  const adminId = session!.user.id;

  if (id === adminId) {
    return NextResponse.json({ error: "Du kan ikke slette din egen bruger." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Bruger ikke fundet" }, { status: 404 });
  }

  if (existing.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "Den sidste administrator kan ikke slettes." }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

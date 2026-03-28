/**
 * Nulstil adgangskode for en eksisterende bruger (SQLite/projektdatabasen fra .env).
 * Brug: npm run db:set-password -- <brugernavn> <ny-adgangskode>
 * Kræver min. 6 tegn (samme som ved oprettelse af bruger i appen).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const usernameRaw = process.argv[2];
  const password = process.argv[3];
  if (!usernameRaw || !password) {
    console.error(
      "Brug: npx tsx prisma/set-password.ts <brugernavn> <ny-adgangskode>\nEksempel: npx tsx prisma/set-password.ts ernesto MitNyeKodeord1",
    );
    process.exit(1);
  }
  if (password.length < 6) {
    console.error("Adgangskode skal være mindst 6 tegn.");
    process.exit(1);
  }
  const username = usernameRaw.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({
    where: { username },
    data: { passwordHash: hash },
    select: { username: true, name: true, role: true },
  });
  console.log("Adgangskode opdateret for:", updated.username, `(${updated.name}, ${updated.role})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    if (e?.code === "P2025") {
      console.error(`Brugeren "${process.argv[2]?.trim().toLowerCase()}" findes ikke i databasen.`);
    } else {
      console.error(e);
    }
    prisma.$disconnect();
    process.exit(1);
  });

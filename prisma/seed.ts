import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultCampaignFieldConfigJson } from "../lib/campaign-fields";

const prisma = new PrismaClient();

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.campaign.findFirst({ where: { name: "Standard" } });
  if (!existing) {
    await prisma.campaign.create({
      data: { name: "Standard", fieldConfig: defaultCampaignFieldConfigJson() },
    });
  }

  const direct = await prisma.campaign.findFirst({ where: { name: "Direkte møder" } });
  if (!direct) {
    await prisma.campaign.create({
      data: { name: "Direkte møder", fieldConfig: defaultCampaignFieldConfigJson() },
    });
  }

  await prisma.user.upsert({
    where: { username: "admin" },
    create: {
      username: "admin",
      name: "Administrator",
      passwordHash: hash,
      role: "ADMIN",
    },
    // Vigtigt: opdater hash ved hver seed, så admin altid kan genåbnes efter glemt kode.
    update: {
      passwordHash: hash,
      name: "Administrator",
      role: "ADMIN",
    },
  });

  console.log(
    'Admin: brugernavn "admin", adgangskode = SEED_ADMIN_PASSWORD miljøvariabel hvis sat, ellers "admin123"',
  );
  console.log('«Standard»- og «Direkte møder»-kampagner oprettes hvis de ikke findes i forvejen.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

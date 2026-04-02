import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { defaultCampaignFieldConfigJson } from "../lib/campaign-fields";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

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
      data: {
        name: "Direkte møder",
        fieldConfig: defaultCampaignFieldConfigJson(),
        isSystemCampaign: true,
        systemCampaignType: "direct_booking",
      },
    });
  }

  const systemDefs = [
    { name: "Kommende møder" as const, systemCampaignType: "upcoming_meetings" as const },
    { name: "Genbook møder" as const, systemCampaignType: "rebooking" as const },
    { name: "Aktive kunder" as const, systemCampaignType: "active_customers" as const },
  ];
  for (const def of systemDefs) {
    const row = await prisma.campaign.findFirst({ where: { name: def.name } });
    if (!row) {
      await prisma.campaign.create({
        data: {
          name: def.name,
          fieldConfig: defaultCampaignFieldConfigJson(),
          isSystemCampaign: true,
          systemCampaignType: def.systemCampaignType,
        },
      });
    }
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
  console.log(
    '«Standard», «Direkte møder» og møde-systemkampagner (Kommende møder, Genbook møder, Aktive kunder) oprettes hvis de ikke findes.',
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });

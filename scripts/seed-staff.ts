/**
 * Run once to create HB Style staff accounts.
 * Usage: npx tsx scripts/seed-staff.ts
 */
import { prisma } from "@calcom/prisma";
import { hashPassword } from "@calcom/lib/auth/hashPassword";
import { MembershipRole } from "@calcom/prisma/enums";

const STAFF = [
  {
    name: "Marielis",
    email: "marielis@hbstyle.com",
    password: "HBStyle2024!",
    username: "marielis-hbstyle",
  },
  {
    name: "Yasmary",
    email: "yasmary@hbstyle.com",
    password: "HBStyle2024!",
    username: "yasmary-hbstyle",
  },
];

const TEAM_NAME = "HB Style";

async function main() {
  console.log("Creating HB Style staff accounts...\n");

  const createdUsers: { id: number; name: string; email: string }[] = [];

  for (const staff of STAFF) {
    const existing = await prisma.user.findUnique({ where: { email: staff.email } });
    if (existing) {
      console.log(`${staff.name} already exists (id=${existing.id}), skipping.`);
      createdUsers.push({ id: existing.id, name: staff.name, email: staff.email });
      continue;
    }

    const hashedPassword = await hashPassword(staff.password);
    const user = await prisma.user.create({
      data: {
        name: staff.name,
        email: staff.email,
        username: staff.username,
        hashedPassword,
        emailVerified: new Date(),
        timeZone: "America/Puerto_Rico",
        locale: "es",
        weekStart: "Monday",
      },
    });

    await prisma.eventType.create({
      data: {
        title: "Servicio de salon",
        slug: `salon-${staff.username}`,
        description: "Cita en HB Style and Hair Gallery",
        length: 60,
        userId: user.id,
        hidden: false,
      },
    });

    console.log(`Created ${staff.name} (id=${user.id}, email=${staff.email})`);
    createdUsers.push({ id: user.id, name: staff.name, email: staff.email });
  }

  // Create or find team
  let team = await prisma.team.findFirst({ where: { name: TEAM_NAME } });
  if (!team) {
    team = await prisma.team.create({
      data: { name: TEAM_NAME, slug: "hb-style" },
    });
    console.log(`\nCreated team "${TEAM_NAME}" (id=${team.id})`);
  } else {
    console.log(`\nTeam "${TEAM_NAME}" already exists (id=${team.id})`);
  }

  // Add staff to team
  for (const u of createdUsers) {
    const existing = await prisma.membership.findUnique({
      where: { userId_teamId: { userId: u.id, teamId: team.id } },
    });
    if (existing) {
      console.log(`   ${u.name} already in team.`);
      continue;
    }
    await prisma.membership.create({
      data: {
        userId: u.id,
        teamId: team.id,
        role: MembershipRole.MEMBER,
        accepted: true,
      },
    });
    console.log(`   Added ${u.name} to team`);
  }

  console.log("\nDone! Staff accounts ready.");
  console.log("Credentials:");
  for (const s of STAFF) {
    console.log(`  ${s.name}: ${s.email} / ${s.password}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

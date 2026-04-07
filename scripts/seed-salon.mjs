/**
 * Seed script for CoquiBook salon users — uses raw pg SQL (no Prisma client needed).
 * Run: node scripts/seed-salon.mjs
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const DB_URL = "postgresql://postgres:postgres@localhost:5432/coquibook";

const SALT_ROUNDS = 12;

const USERS = [
  {
    email: "hbstyle@hb.pr",
    name: "HB Style & Hair Gallery",
    username: "hbstyle",
    password: "Kata123",
    role: "ADMIN",
  },
  {
    email: "marielis@coquibook.pr",
    name: "Marielis",
    username: "marielis",
    password: "Marielis@CQ2025!",
    role: "USER",
  },
  {
    email: "yasmary@coquibook.pr",
    name: "Yasmary",
    username: "yasmary",
    password: "Yasmary@CQ2025!",
    role: "USER",
  },
];

const SERVICES = [
  { title: "Corte de cabello", slug: "corte", length: 30 },
  { title: "Coloración", slug: "coloracion", length: 60 },
  { title: "Tratamiento", slug: "tratamiento", length: 45 },
  { title: "Peinado", slug: "peinado", length: 30 },
];

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  console.log("🌺 Seeding CoquiBook salon users...\n");

  // Migrate old admin account if it exists
  await db.query(
    `UPDATE users SET email = 'hbstyle@hb.pr', username = 'hbstyle', name = 'HB Style & Hair Gallery'
     WHERE email = 'salon@coquibook.pr'`
  );

  const createdUsers = [];

  for (const u of USERS) {
    // Check if user exists
    const existing = await db.query(`SELECT id FROM users WHERE email = $1`, [u.email]);

    let userId;
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      console.log(`⏭️  User already exists: ${u.email} (id=${userId})`);
    } else {
      const res = await db.query(
        `INSERT INTO users (email, name, username, "timeZone", "weekStart", "emailVerified", role, "completedOnboarding", uuid)
         VALUES ($1, $2, $3, 'America/Puerto_Rico', 'Monday', NOW(), $4::"UserPermissionRole", true, gen_random_uuid())
         RETURNING id`,
        [u.email, u.name, u.username, u.role]
      );
      userId = res.rows[0].id;
      console.log(`✅ Created user: ${u.email} (id=${userId})`);
    }

    // Upsert password
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await db.query(
      `INSERT INTO "UserPassword" ("userId", hash) VALUES ($1, $2)
       ON CONFLICT ("userId") DO UPDATE SET hash = EXCLUDED.hash`,
      [userId, hash]
    );

    createdUsers.push({ id: userId, name: u.name, email: u.email, role: u.role, username: u.username, password: u.password });
  }

  // Event types for staff members only
  const staff = createdUsers.filter((u) => u.role === "USER");
  for (const s of staff) {
    for (const svc of SERVICES) {
      const slug = `${svc.slug}-${s.username}`;
      const ex = await db.query(
        `SELECT id FROM "EventType" WHERE "userId" = $1 AND slug = $2`,
        [s.id, slug]
      );
      if (ex.rows.length === 0) {
        await db.query(
          `INSERT INTO "EventType" (title, slug, length, "userId", hidden)
           VALUES ($1, $2, $3, $4, false)`,
          [svc.title, slug, svc.length, s.id]
        );
        console.log(`  📅 Event type "${svc.title}" → ${s.name}`);
      }
    }
  }

  // Create team
  let teamId;
  const teamEx = await db.query(`SELECT id FROM "Team" WHERE slug = 'coquibook-salon'`);
  if (teamEx.rows.length > 0) {
    teamId = teamEx.rows[0].id;
    console.log("\n⏭️  Team already exists");
  } else {
    const res = await db.query(
      `INSERT INTO "Team" (name, slug) VALUES ('CoquiBook Salón', 'coquibook-salon') RETURNING id`
    );
    teamId = res.rows[0].id;
    console.log("\n✅ Created team: CoquiBook Salón");
  }

  // Add members to team
  for (const u of createdUsers) {
    const memberRole = u.role === "ADMIN" ? "OWNER" : "MEMBER";
    const ex = await db.query(
      `SELECT id FROM "Membership" WHERE "userId" = $1 AND "teamId" = $2`,
      [u.id, teamId]
    );
    if (ex.rows.length === 0) {
      await db.query(
        `INSERT INTO "Membership" ("teamId", "userId", role, accepted) VALUES ($1, $2, $3::"MembershipRole", true)`,
        [teamId, u.id, memberRole]
      );
      console.log(`  👥 Added ${u.name} as ${memberRole}`);
    }
  }

  await db.end();

  console.log("\n✨ Listo! Credenciales:\n");
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log("│  CUENTA PRINCIPAL (HB Style & Hair Gallery)         │");
  console.log("│  Usuario:  HBSTYLE                                  │");
  console.log("│  Password: Kata123                                  │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│  MARIELIS (empleada)                                │");
  console.log("│  Email:    marielis@coquibook.pr                    │");
  console.log("│  Password: Marielis@CQ2025!                         │");
  console.log("├─────────────────────────────────────────────────────┤");
  console.log("│  YASMARY (empleada)                                 │");
  console.log("│  Email:    yasmary@coquibook.pr                     │");
  console.log("│  Password: Yasmary@CQ2025!                          │");
  console.log("└─────────────────────────────────────────────────────┘");
}

main().catch((e) => {
  console.error("❌ Seed failed:", e.message);
  globalThis.process?.exit(1);
});

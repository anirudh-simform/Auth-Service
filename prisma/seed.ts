import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'src/generated/prisma/client';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const permissions = [
    {
      key: 'organization.read',
      name: 'View organization',
    },
    {
      key: 'organization.delete',
      name: 'Delete organization',
    },
    {
      key: 'organization.transfer_ownership',
      name: 'Transfer Organization Ownership',
    },
    {
      key: 'organization.update',
      name: 'Edit organization settings',
    },
    {
      key: 'member.invite',
      name: 'Invite users',
    },
    {
      key: 'member.remove',
      name: 'Remove users',
    },
    {
      key: 'member.role.update',
      name: 'Change member roles',
    },
    {
      key: 'role.create',
      name: 'Create roles',
    },
    {
      key: 'role.update',
      name: 'Edit roles',
    },
    {
      key: 'role.delete',
      name: 'Delete roles',
    },
    {
      key: 'audit.read',
      name: 'View audit logs',
    },
  ];

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: {},
      create: { key: permission.key, name: permission.name },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });

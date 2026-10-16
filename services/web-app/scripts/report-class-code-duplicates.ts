import { PrismaClient } from '@app/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { readDuplicateClassCodes } from '../app/utils/class-code-write.server';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  console.log(JSON.stringify({ comparison: 'ECMAScript trim().toUpperCase()',
    includesArchivedClasses: true, items: await readDuplicateClassCodes(db) }, null, 2));
} finally {
  await db.$disconnect();
}

import { defineConfig } from 'prisma/config';

const prismaDirectory = process.env.REHEARSAL_PRISMA_DIR;

if (!prismaDirectory) {
  throw new Error('REHEARSAL_PRISMA_DIR is required');
}

export default defineConfig({
  schema: `${prismaDirectory}/schema.prisma`,
  migrations: { path: `${prismaDirectory}/migrations` },
  datasource: { url: process.env.DATABASE_URL! },
});

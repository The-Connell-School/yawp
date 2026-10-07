/* eslint-disable no-console */
/**
 * Preview / local bootstrap for the Exit Ticket assignment type.
 * Production uses migration 20261007174800 instead of this script on deploy.
 *
 *   cd packages/prisma && DATABASE_URL=... bun run scripts/seed-exit-ticket-assignment-type.ts --all-orgs
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  bootstrapExitTicketAssignmentType,
  resolveBootstrapOrganizationIds,
} from './bootstrap-exit-ticket-assignment-type';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal = isLocalDatabaseUrl(connectionString);
const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

async function seedExitTicketAssignmentType() {
  const argv = process.argv.slice(2);
  const organizationIds = await resolveBootstrapOrganizationIds(prisma, argv);
  if (organizationIds.length === 0) {
    throw new Error(
      'Cannot seed the Exit Ticket assignment type without an organization.'
    );
  }

  const { assignmentTypeId } = await bootstrapExitTicketAssignmentType(prisma, {
    organizationIds,
    attachImageIfMissing: true,
  });

  const organizations = await prisma.organization.findMany({
    where: { id: { in: organizationIds } },
    select: { id: true, name: true },
  });

  console.log(
    `Exit Ticket assignment type ${assignmentTypeId} linked to organizations: ${organizations
      .map((org) => `${org.name} (${org.id})`)
      .join(', ')}`
  );
  console.log(
    'Customized school/teacher lists were not modified; those scopes inherit org defaults only when uncustomized.'
  );
}

seedExitTicketAssignmentType()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

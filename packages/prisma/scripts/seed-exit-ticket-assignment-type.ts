/* eslint-disable no-console */
/**
 * Creates the Exit Ticket assignment type and gives it to one or more
 * organizations. Idempotent — safe to re-run.
 *
 *   cd packages/prisma && DATABASE_URL=... bun run scripts/seed-exit-ticket-assignment-type.ts
 *   ... scripts/seed-exit-ticket-assignment-type.ts --org=<id> --org=<id>
 *
 * With no --org flags it targets the oldest organization only, so a new
 * assignment type is never switched on for every customer at once.
 *
 * The admin assignment-type creator cannot set `kind`, and `kind` is what the
 * web app reads to show the exit ticket form instead of a prompt box. So this
 * script — not the admin UI — is how an Exit Ticket type comes into being.
 */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_INSTRUCTION_DATA,
  EXIT_TICKET_MODULE_DATA,
  parseExitTicketOrganizationArgs,
  resolveExitTicketOrganizationIds,
} from './exit-ticket-assignment-type-data';

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
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });

  const { organizationIds, unknownOrganizationIds } =
    resolveExitTicketOrganizationIds({
      requestedOrganizationIds: parseExitTicketOrganizationArgs(
        process.argv.slice(2)
      ),
      existingOrganizationIds: organizations.map((org) => org.id),
    });

  if (unknownOrganizationIds.length > 0) {
    throw new Error(
      `Unknown organization ids: ${unknownOrganizationIds.join(', ')}`
    );
  }
  if (organizationIds.length === 0) {
    throw new Error(
      'Cannot seed the Exit Ticket assignment type without an organization.'
    );
  }

  const ownerOrgId = organizationIds[0];

  const assignmentType = await prisma.assignmentType.upsert({
    where: { kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND },
    // Re-running restores an archived type and refreshes its copy. It does not
    // touch ownership or the rubric, so anything an admin configured survives.
    update: {
      ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
      kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
      ownerOrgId,
      assignmentModules: {
        create: {
          ...EXIT_TICKET_MODULE_DATA,
          instructions: { create: EXIT_TICKET_INSTRUCTION_DATA },
        },
      },
    },
    select: { id: true },
  });

  for (const organizationId of organizationIds) {
    await prisma.organizationAssignmentType.upsert({
      where: {
        organizationId_assignmentTypeId: {
          organizationId,
          assignmentTypeId: assignmentType.id,
        },
      },
      create: { organizationId, assignmentTypeId: assignmentType.id },
      update: {},
    });
  }

  const named = organizations
    .filter((org) => organizationIds.includes(org.id))
    .map((org) => `${org.name} (${org.id})`);

  console.log(
    `Exit Ticket assignment type ${assignmentType.id} available to: ${named.join(', ')}`
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

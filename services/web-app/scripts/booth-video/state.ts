/**
 * Prints the booth class's current ids as one JSON line, for record.mjs to
 * navigate by: the class, its latest assignment, and the featured student's
 * document and latest submission.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../../packages/prisma/generated/prisma';
import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';
import { CLASS, STUDENT } from './copy.mjs';

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!isLocalDatabaseUrl(databaseUrl)) throw new Error('state.ts only reads a local database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, ssl: false }) });

try {
  const boothClass = await prisma.class.findFirstOrThrow({ where: { code: CLASS.code, isArchived: false } });
  const classAssignment = await prisma.classAssignment.findFirst({ where: { classId: boothClass.id }, orderBy: { createdAt: 'desc' } });
  const student = await prisma.user.findUniqueOrThrow({ where: { email: STUDENT.email }, include: { memberships: true } });
  const document = classAssignment
    ? await prisma.document.findFirst({
        where: { classAssignmentId: classAssignment.id, membershipId: student.memberships[0]!.id },
        include: { submissions: { orderBy: { submittedAt: 'desc' }, take: 1 } },
      })
    : null;
  console.log(JSON.stringify({
    classId: boothClass.id,
    assignmentId: classAssignment?.assignmentId ?? null,
    classAssignmentId: classAssignment?.id ?? null,
    documentId: document?.id ?? null,
    submissionId: document?.submissions[0]?.id ?? null,
  }));
} finally {
  await prisma.$disconnect();
}

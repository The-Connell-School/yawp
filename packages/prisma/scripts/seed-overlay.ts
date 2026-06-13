/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { createPassword } from './utils';
import { isLocalDatabaseUrl } from './seed-overlay-connection';

// --- Connection setup (same pattern as seed.ts) ---

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

// --- Constants ---

const ORG_ID = 'e2e-test-org';
const ORG_NAME = 'E2E Test Organization';
const SCHOOL_CODE = 'E2E-SCHOOL';
const CLASS_CODE = 'E2E-CLASS';

// --- Overlay logic ---

export type E2EContext = {
  organizationId: string;
  userId: string;
  userEmail: string;
  adminUserId: string;
  adminEmail: string;
  membershipId: string;
  assignmentTypeId: string;
  documentId: string;
  classId: string;
  classCode: string;
  schoolId: string;
  teacherMembershipId: string;
  teacherName: string;
  teacherEmail: string;
};

async function upsertUser(
  data: {
    email: string;
    name: string;
    password: string;
    isAdmin?: boolean;
  },
) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    await prisma.password.upsert({
      where: { userId: existing.id },
      update: { hash: createPassword(data.password).hash },
      create: { userId: existing.id, hash: createPassword(data.password).hash },
    });
    if (data.isAdmin !== undefined) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isAdmin: data.isAdmin },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      isAdmin: data.isAdmin,
      password: { create: createPassword(data.password) },
    },
  });
}

async function ensureMembership(params: {
  userId: string;
  organizationId: string;
  role: 'TEACHER' | 'STUDENT';
  isOrgOwner?: boolean;
}) {
  const existing = await prisma.orgMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: params.userId,
        organizationId: params.organizationId,
      },
    },
  });
  if (existing) {
    return existing;
  }
  return prisma.orgMembership.create({
    data: {
      userId: params.userId,
      organizationId: params.organizationId,
      role: params.role,
      isOrgOwner: params.isOrgOwner ?? false,
    },
  });
}

export async function seedOverlay(): Promise<E2EContext> {
  console.log('🌱 Running seed overlay (test users on top of production data)...');

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: ORG_NAME },
    create: { id: ORG_ID, name: ORG_NAME },
  });

  // 2. School
  let school = await prisma.school.findFirst({
    where: { code: SCHOOL_CODE, organizationId: org.id },
  });
  if (!school) {
    school = await prisma.school.create({
      data: { name: 'E2E High', code: SCHOOL_CODE, organizationId: org.id },
    });
  }

  // 3. Teacher user + membership
  const teacherEmail = 'teacher.e2e@yawp.test';
  const teacherName = 'Mrs Test Teacher';
  const teacherUser = await upsertUser({
    email: teacherEmail,
    name: teacherName,
    password: 'teacher-e2e-password',
  });
  const teacherMembership = await ensureMembership({
    userId: teacherUser.id,
    organizationId: org.id,
    role: 'TEACHER',
    isOrgOwner: true,
  });
  await prisma.$executeRaw`
    INSERT INTO "_SchoolTeachers" ("A", "B")
    VALUES (${school.id}, ${teacherMembership.id})
    ON CONFLICT DO NOTHING
  `;

  // 4. Class
  let klass = await prisma.class.findFirst({
    where: { code: CLASS_CODE, schoolId: school.id },
  });
  if (!klass) {
    klass = await prisma.class.create({
      data: {
        code: CLASS_CODE,
        schoolYear: '2024-2025',
        period: '1st',
        grade: '9th',
        schoolId: school.id,
        teachers: { connect: { id: teacherMembership.id } },
      },
    });
  }

  // 5. Student user + membership
  const studentUser = await upsertUser({
    email: 'jdoe@brock.software',
    name: 'John Doe',
    password: 'johndoe',
  });
  const studentMembership = await ensureMembership({
    userId: studentUser.id,
    organizationId: org.id,
    role: 'STUDENT',
    isOrgOwner: false,
  });
  await prisma.orgMembership.update({
    where: { id: studentMembership.id },
    data: { classesAsStudent: { connect: { id: klass.id } } },
  });

  // 6. Admin user + membership
  const adminUser = await upsertUser({
    email: 'admin.e2e@yawp.test',
    name: 'Admin E2E',
    password: 'admin-e2e-password',
    isAdmin: true,
  });
  await ensureMembership({
    userId: adminUser.id,
    organizationId: org.id,
    role: 'TEACHER',
    isOrgOwner: true,
  });

  // 7. Smoke test users (for preview environments)
  for (const u of [
    { email: 'teacher@fake.test', name: 'Teacher User', password: 'teacher123' },
    { email: 'admin@fake.test', name: 'Admin User', password: 'admin123', isAdmin: true as const },
    { email: 'student@fake.test', name: 'Student User', password: 'student123' },
  ]) {
    await upsertUser(u);
  }

  // 7b. Preview smoke uses teacher@fake.test — production data may already have that user without a
  // teacher membership; without it login lands on /no-profile instead of /app.
  const smokeTeacherUser = await prisma.user.findUnique({
    where: { email: 'teacher@fake.test' },
  });
  if (smokeTeacherUser) {
    const smokeTeacherMembership = await ensureMembership({
      userId: smokeTeacherUser.id,
      organizationId: org.id,
      role: 'TEACHER',
      isOrgOwner: true,
    });
    await prisma.$executeRaw`
      INSERT INTO "_SchoolTeachers" ("A", "B")
      VALUES (${school.id}, ${smokeTeacherMembership.id})
      ON CONFLICT DO NOTHING
    `;
  }

  // 8. Assignment type with modules + instructions (formerly StudentCourse)
  let assignmentType = await prisma.assignmentType.findFirst({
    where: { title: 'E2E Course', ownerOrgId: org.id },
    select: {
      id: true,
      assignmentModules: { select: { id: true, position: true } },
    },
  });
  if (!assignmentType) {
    assignmentType = await prisma.assignmentType.create({
      data: {
        title: 'E2E Course',
        position: 1,
        ownerOrgId: org.id,
        organizationAssignments: {
          create: { organizationId: org.id },
        },
        assignmentModules: {
          create: [1, 2, 3].map((moduleIndex) => ({
            title: `E2E Module ${moduleIndex}`,
            position: moduleIndex,
            instructions: {
              create: [1, 2, 3].map((instructionIndex) => ({
                title: `Instruction ${moduleIndex}.${instructionIndex}`,
                prompt: `Prompt for instruction ${moduleIndex}.${instructionIndex}`,
                position: instructionIndex,
                showChatButton: true,
              })),
            },
          })),
        },
      },
      select: {
        id: true,
        assignmentModules: { select: { id: true, position: true } },
      },
    });
  }
  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: org.id,
        assignmentTypeId: assignmentType.id,
      },
    },
    create: {
      organizationId: org.id,
      assignmentTypeId: assignmentType.id,
    },
    update: {},
  });

  // 9. Class assignment linking the class to the assignment type
  let classAssignment = await prisma.classAssignment.findFirst({
    where: {
      classId: klass.id,
      assignment: { assignmentTypeId: assignmentType.id },
    },
    select: { id: true, assignmentId: true },
  });
  if (!classAssignment) {
    const assignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: assignmentType.id,
        title: 'E2E Class Assignment',
        prompt: 'E2E prompt for class assignment.',
      },
      select: { id: true },
    });
    classAssignment = await prisma.classAssignment.create({
      data: {
        classId: klass.id,
        assignmentId: assignment.id,
      },
      select: { id: true, assignmentId: true },
    });
  }

  // 10. Document
  let document = await prisma.document.findFirst({
    where: { membershipId: studentMembership.id, title: 'E2E Doc' },
    select: { id: true },
  });
  if (!document) {
    document = await prisma.document.create({
      data: {
        title: 'E2E Doc',
        text: 'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.',
        html: '<p>This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.</p>',
        membershipId: studentMembership.id,
        assignmentTypeId: assignmentType.id,
        assignmentId: classAssignment.assignmentId,
        classAssignmentId: classAssignment.id,
      },
      select: { id: true },
    });
  }

  // 11. Assignment module session (formerly StudentCourseModuleSession)
  const firstModuleId = assignmentType.assignmentModules.sort(
    (a, b) => a.position - b.position
  )[0].id;
  const existingSession = await prisma.assignmentModuleSession.findFirst({
    where: {
      documentId: document.id,
      assignmentModuleId: firstModuleId,
    },
  });
  if (!existingSession) {
    await prisma.assignmentModuleSession.create({
      data: {
        assignmentModuleId: firstModuleId,
        documentId: document.id,
        title: 'E2E Doc Session',
        instructionsCompleted: 0,
      },
    });
  }

  const context: E2EContext = {
    organizationId: org.id,
    userId: studentUser.id,
    userEmail: studentUser.email,
    adminUserId: adminUser.id,
    adminEmail: adminUser.email,
    membershipId: studentMembership.id,
    assignmentTypeId: assignmentType.id,
    documentId: document.id,
    classId: klass.id,
    classCode: CLASS_CODE,
    schoolId: school.id,
    teacherMembershipId: teacherMembership.id,
    teacherName,
    teacherEmail,
  };

  console.log('🌱 Seed overlay complete.');
  return context;
}

// When run as a standalone script, execute and print context
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed-overlay.ts')) {
  seedOverlay()
    .then((ctx) => {
      console.log(JSON.stringify(ctx, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

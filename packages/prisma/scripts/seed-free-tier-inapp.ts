import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import { ensurePreviewFreeClassroomFixture } from './local-dev/seed-preview-free-classroom';
assertLocalSeedTarget();
const prisma = createPrismaClient();
try {
  // Recover only records owned by this local evidence profile after an interrupted run.
  const originalClass = await prisma.class.findFirst({
    where: {
      isArchived: false,
      school: { organizationId: 'preview-free-classroom' },
    },
  });
  const spareClasses = await prisma.class.findMany({
    where: {
      isArchived: true,
      code: { startsWith: 'inapp-' },
      school: { organizationId: 'preview-free-classroom' },
    },
    select: { id: true },
  });
  if (originalClass && spareClasses.length) {
    await prisma.classAssignment.updateMany({
      where: { classId: { in: spareClasses.map((klass) => klass.id) } },
      data: { classId: originalClass.id },
    });
    await prisma.class.deleteMany({
      where: { id: { in: spareClasses.map((klass) => klass.id) } },
    });
  }
  await prisma.lessonPlanConversation.deleteMany({
    where: { id: { startsWith: 'inapp-' } },
  });
  const staleUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'inapp-' } },
    select: { id: true },
  });
  await prisma.orgMembership.deleteMany({
    where: { userId: { in: staleUsers.map((user) => user.id) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: staleUsers.map((user) => user.id) } },
  });
  await ensurePreviewFreeClassroomFixture(prisma);
} finally {
  await prisma.$disconnect();
}

import { data as dataResponse } from 'react-router';
import { requireUserId } from '~/utils/auth.server.ts';
import { prisma } from '~/utils/db.server';

export async function action({ request }: { request: Request }) {
  const userId = await requireUserId(request);
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
      OR: [{ teacherProfile: { isNot: null } }, { isAdmin: true }],
    },
  });

  if (!user) {
    return dataResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const cmsId = formData.get('cmsId')?.toString();

  if (!cmsId) {
    return dataResponse(
      { error: 'Course module session ID is required' },
      { status: 400 }
    );
  }

  const cms = await prisma.courseModuleSession.findUnique({
    where: { id: cmsId },
    include: { document: true },
  });

  if (!cms) {
    return dataResponse(
      { error: 'Course module session not found' },
      { status: 404 }
    );
  }

  await Promise.all([
    prisma.courseModuleSession.deleteMany({
      where: {
        documentId: cms.documentId,
        createdAt: { gt: cms.createdAt },
      },
    }),
    prisma.courseModuleSession.update({
      where: { id: cmsId },
      data: {
        instructionsCompleted: { decrement: 1 },
      },
    }),
  ]);

  return dataResponse({ success: true });
}

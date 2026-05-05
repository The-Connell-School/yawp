import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { loadStudentPileContents } from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
  const studentProfileId = params.studentProfileId!;
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    throw new Response('Forbidden', { status: 403 });
  }
  const klass = await prisma.class.findFirst({
    where: {
      id: classId,
      teachers: { some: { id: profile.teacherProfile.id } },
    },
    select: { id: true },
  });
  if (!klass) throw new Response('Class not found', { status: 404 });

  const url = new URL(request.url);
  const filters = parseUrlFilters(url);
  const rows = await loadStudentPileContents({
    classId,
    studentProfileId,
    filters,
  });
  return dataResponse({ rows });
}

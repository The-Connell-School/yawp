import { data as dataResponse, type LoaderFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { loadPileContents } from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
  const assignmentTypeId = params.assignmentTypeId!;
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
  const skip = Number.parseInt(url.searchParams.get('skip') ?? '0', 10) || 0;
  const take = Math.min(
    Number.parseInt(url.searchParams.get('take') ?? '50', 10) || 50,
    200
  );

  const rows = await loadPileContents({
    classId,
    assignmentTypeId,
    filters,
    take,
    skip,
  });
  return dataResponse({ rows, hasMore: rows.length === take });
}

import {
  data as dataResponse,
  redirect,
  type LoaderFunctionArgs,
} from 'react-router';
import { useLoaderData } from 'react-router';
import { prisma } from '~/utils/db.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isReleasedGradesOrganizationEnabledForOrganization } from '~/utils/feature-flags.server';
import {
  loadPiles,
  loadStudentPiles,
  type Pile,
  type StudentPile,
} from '~/services/released-grades.server';
import { parseUrlFilters } from '~/services/released-grades.url-filters';

type View = 'byAssignment' | 'byStudent';

type StudentOption = { id: string; name: string };

type LoaderData =
  | {
      view: 'byAssignment';
      piles: Pile[];
      classId: string;
      className: string;
      studentOptions: StudentOption[];
    }
  | {
      view: 'byStudent';
      studentPiles: StudentPile[];
      classId: string;
      className: string;
      studentOptions: StudentOption[];
    };

export async function loader({ request, params }: LoaderFunctionArgs) {
  const classId = params.classId!;
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
    select: {
      id: true,
      title: true,
      school: { select: { organizationId: true } },
    },
  });
  if (!klass) throw new Response('Class not found', { status: 404 });

  const enabled = await isReleasedGradesOrganizationEnabledForOrganization(
    klass.school.organizationId
  );
  if (!enabled) throw redirect(`/app/my-classes/${classId}`);

  const url = new URL(request.url);
  const view: View =
    url.searchParams.get('view') === 'byStudent' ? 'byStudent' : 'byAssignment';
  const filters = parseUrlFilters(url);

  // Roster of students for the FiltersBar multi-select.
  const students = await prisma.studentProfile.findMany({
    where: { classes: { some: { id: classId } } },
    select: {
      id: true,
      profile: { select: { user: { select: { name: true } } } },
    },
  });
  const studentOptions: StudentOption[] = students
    .map((s) => ({
      id: s.id,
      name: s.profile?.user.name ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const className = klass.title ?? '';

  if (view === 'byStudent') {
    const studentPiles = await loadStudentPiles({ classId, filters });
    return dataResponse<LoaderData>({
      view,
      studentPiles,
      classId,
      className,
      studentOptions,
    });
  }
  const piles = await loadPiles({ classId, filters });
  return dataResponse<LoaderData>({
    view,
    piles,
    classId,
    className,
    studentOptions,
  });
}

export default function ReleasedGradesRoute() {
  const data = useLoaderData<typeof loader>() as LoaderData;
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">
        Released grades — {data.className}
      </h1>
      <pre className="text-xs">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}

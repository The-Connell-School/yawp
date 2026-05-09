import { useEffect, useState } from 'react';
import {
  data as dataResponse,
  redirect,
  type LoaderFunctionArgs,
} from 'react-router';
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router';
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
import { FiltersBar } from '~/components/released-grades/FiltersBar';
import { PileAccordion } from '~/components/released-grades/PileAccordion';
import { StudentAccordion } from '~/components/released-grades/StudentAccordion';

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
      grade: true,
      period: true,
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
  type StudentRow = {
    id: string;
    profile: { user: { name: string | null } } | null;
  };
  const studentOptions: StudentOption[] = (students as StudentRow[])
    .map((s) => ({
      id: s.id,
      name: s.profile?.user.name ?? '',
    }))
    .sort((a: StudentOption, b: StudentOption) =>
      a.name.localeCompare(b.name)
    );

  const className =
    klass.title?.trim() || `Grade ${klass.grade} • Period ${klass.period}`;

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

const EXPAND_ALL_KEY = 'releasedGrades.expandAll';

export default function ReleasedGradesRoute() {
  const data = useLoaderData<typeof loader>() as LoaderData;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [expandAll, setExpandAll] = useState(false);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(EXPAND_ALL_KEY)
        : null;
    if (stored === '1') setExpandAll(true);
  }, []);

  function toggleExpandAll() {
    setExpandAll((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined')
        window.localStorage.setItem(EXPAND_ALL_KEY, next ? '1' : '0');
      return next;
    });
  }

  function setView(nextView: 'byAssignment' | 'byStudent') {
    const next = new URLSearchParams(searchParams);
    if (nextView === 'byStudent') next.set('view', 'byStudent');
    else next.delete('view');
    navigate(
      `/app/my-classes/${data.classId}/released-grades?${next.toString()}`
    );
  }

  // Build a filter-only query string for child fetchers (drop `view`).
  const filterQuery = (() => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    return next.toString();
  })();

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Released grades — {data.className}
        </h1>
        <div className="flex items-center gap-3">
          <div role="tablist" className="rounded border text-sm">
            <button
              role="tab"
              aria-selected={data.view === 'byAssignment'}
              className={`px-3 py-1 ${data.view === 'byAssignment' ? 'bg-accent' : ''}`}
              onClick={() => setView('byAssignment')}
            >
              By assignment
            </button>
            <button
              role="tab"
              aria-selected={data.view === 'byStudent'}
              className={`px-3 py-1 ${data.view === 'byStudent' ? 'bg-accent' : ''}`}
              onClick={() => setView('byStudent')}
            >
              By student
            </button>
          </div>
          <button className="text-sm underline" onClick={toggleExpandAll}>
            {expandAll ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>
      <FiltersBar
        classId={data.classId}
        view={data.view}
        studentOptions={data.studentOptions}
      />
      <div className="mt-4">
        {data.view === 'byAssignment' ? (
          <PileAccordion
            classId={data.classId}
            piles={data.piles}
            filterQuery={filterQuery}
            expandAll={expandAll}
          />
        ) : (
          <StudentAccordion
            classId={data.classId}
            studentPiles={data.studentPiles}
            filterQuery={filterQuery}
            expandAll={expandAll}
          />
        )}
      </div>
    </div>
  );
}

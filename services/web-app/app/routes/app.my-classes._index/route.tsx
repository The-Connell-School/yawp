import { User, ClipboardCheck, Send } from 'lucide-react';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Tooltip } from '~/components/ui/tooltip';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const [classes, teacher] = await Promise.all([
    prisma.class.findMany({
      where: {
        teachers: { some: { id: profile.teacherProfile.id } },
        isArchived: false,
      },
      select: {
        id: true,
        grade: true,
        period: true,
        title: true,
        school: { select: { id: true, name: true } },
        _count: { select: { students: true, teachers: true } },
      },
      orderBy: [
        { school: { name: 'asc' } },
        { grade: 'asc' },
        { period: 'asc' },
      ],
    }),
    prisma.teacherProfile.findUnique({
      where: { id: profile.teacherProfile.id },
      select: { schools: { select: { id: true } } },
    }),
  ]);

  // Get document stats for each class
  const classStats = await Promise.all(
    classes.map(async (klass: (typeof classes)[number]) => {
      const gradedUnreleasedCount = await prisma.document.count({
        where: {
          classId: klass.id,
          submittedAt: { not: null },
          submittedSnapshot: {
            grades: {
              some: {
                releasedAt: null,
              },
            },
          },
        },
      });

      // Count ungraded submissions
      const ungradedCount = await prisma.document.count({
        where: {
          classId: klass.id,
          submittedAt: { not: null },
          submittedSnapshot: {
            grades: { none: {} },
          },
        },
      });

      return {
        classId: klass.id,
        ungradedCount,
        gradedUnreleasedCount,
      };
    })
  );

  const teacherSchoolCount = teacher?.schools.length ?? 0;
  const schools = Array.from(
    new Map(
      classes
        .map((c) => c.school)
        .filter(Boolean)
        .map((s) => [s!.id, { id: s!.id, name: s!.name }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const classesWithStats = classes.map((klass) => {
    const stats = classStats.find((s) => s.classId === klass.id);
    return { ...klass, stats };
  });

  return dataResponse({
    classes: classesWithStats,
    teacherSchoolCount,
    schools,
  });
}

export default function MyClassesRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSchoolId = searchParams.get('school') ?? 'all';

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>My Classes</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
              Classes you are assigned to. Creation is managed by admins.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        {data.schools.length > 1 ? (
          <div className="mb-4">
            <Tabs
              value={selectedSchoolId}
              onValueChange={(value) => {
                const next = new URLSearchParams(searchParams);
                if (value === 'all') {
                  next.delete('school');
                } else {
                  next.set('school', value);
                }
                setSearchParams(next, { replace: true });
              }}
            >
              <TabsList>
                <TabsTrigger value="all">All schools</TabsTrigger>
                {data.schools.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    {s.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
        {data.classes.length ? (
          <div className="grid grid-cols-1 gap-2.5">
            {data.classes
              .filter((klass) =>
                selectedSchoolId === 'all'
                  ? true
                  : klass.school?.id === selectedSchoolId
              )
              .map((klass) => (
                <div
                  key={klass.id}
                  className="flex items-center gap-3 rounded-lg border bg-muted p-3.5 hover:shadow-sm transition"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/app/my-classes/${klass.id}`}
                      className="hover:underline"
                    >
                      <h4 className="font-semibold text-base">
                        Grade {klass.grade} • Period {klass.period}
                        {klass.title && (
                          <span className="font-normal text-muted-foreground">
                            {' '}
                            — {klass.title}
                          </span>
                        )}
                      </h4>
                    </Link>
                    <div className="flex items-center gap-2 mt-1">
                      {klass.school?.name && (
                        <span className="text-xs text-muted-foreground">
                          {klass.school.name}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 h-5 px-1.5"
                      >
                        <User className="w-3 h-3" />
                        <span className="text-xs">{klass._count.students}</span>
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {(klass.stats?.ungradedCount ?? 0) > 0 && (
                      <Tooltip
                        text={`${klass.stats.ungradedCount} submission${klass.stats.ungradedCount === 1 ? '' : 's'} to grade`}
                      >
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-orange-50 dark:bg-orange-950/20">
                          <ClipboardCheck className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                          <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                            {klass.stats.ungradedCount}
                          </span>
                        </div>
                      </Tooltip>
                    )}
                    {(klass.stats?.gradedUnreleasedCount ?? 0) > 0 && (
                      <Tooltip
                        text={`${klass.stats.gradedUnreleasedCount} graded submission${klass.stats.gradedUnreleasedCount === 1 ? '' : 's'} ready to release`}
                      >
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950/20">
                          <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {klass.stats.gradedUnreleasedCount}
                          </span>
                        </div>
                      </Tooltip>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button asChild size="sm" variant="default" className="h-8">
                      <Link to={`/app/my-classes/${klass.id}`}>Open</Link>
                    </Button>
                    {(klass.stats?.ungradedCount ?? 0) > 0 && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8"
                      >
                        <Link to={`/app/my-classes/${klass.id}?tab=to-grade`}>
                          Grade
                        </Link>
                      </Button>
                    )}
                    {(klass.stats?.gradedUnreleasedCount ?? 0) > 0 && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8"
                      >
                        <Link to={`/app/my-classes/${klass.id}?tab=to-release`}>
                          Release
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
            <p>No classes assigned yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

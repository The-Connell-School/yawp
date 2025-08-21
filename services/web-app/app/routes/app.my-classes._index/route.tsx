import { User } from 'lucide-react';
import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
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
      where: { teachers: { some: { id: profile.teacherProfile.id } } },
      select: {
        id: true,
        grade: true,
        period: true,
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

  const teacherSchoolCount = teacher?.schools.length ?? 0;
  const schools = Array.from(
    new Map(
      classes
        .map((c) => c.school)
        .filter(Boolean)
        .map((s) => [s!.id, { id: s!.id, name: s!.name }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  return dataResponse({ classes, teacherSchoolCount, schools });
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
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.classes
              .filter((klass) =>
                selectedSchoolId === 'all'
                  ? true
                  : klass.school?.id === selectedSchoolId
              )
              .map((klass) => (
                <Link
                  key={klass.id}
                  to={`/app/my-classes/${klass.id}`}
                  className="flex flex-col rounded-lg border bg-muted p-4 hover:shadow transition"
                >
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-foreground/90 font-medium">
                      Grade {klass.grade} • Period {klass.period}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center">
                      <User className="w-3 h-3 inline-block mr-1" />
                      {klass._count.students}
                    </p>
                  </div>
                </Link>
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

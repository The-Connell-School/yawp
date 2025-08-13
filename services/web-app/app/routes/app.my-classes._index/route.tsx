import { type LoaderFunctionArgs, data as dataResponse } from 'react-router';
import { Link, useLoaderData } from 'react-router';
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
        school: { select: { name: true } },
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
  return dataResponse({ classes, teacherSchoolCount });
}

export default function MyClassesRoute() {
  const data = useLoaderData<typeof loader>();
  const hideSchool = (data.teacherSchoolCount ?? 0) === 1;

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
        {data.classes.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.classes.map((klass) => (
              <Link
                key={klass.id}
                to={`/app/my-classes/${klass.id}`}
                className="flex flex-col rounded-lg border bg-muted p-4 hover:shadow transition"
              >
                <div className="flex items-baseline justify-between">
                  <h4 className="text-foreground/90 font-medium">
                    Grade {klass.grade} • Period {klass.period}
                  </h4>
                </div>
                {hideSchool ? null : (
                  <p className="text-sm text-muted-foreground mt-1">
                    {klass.school?.name ?? 'School'}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{klass._count.students} students</span>
                  <span>{klass._count.teachers} teachers</span>
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

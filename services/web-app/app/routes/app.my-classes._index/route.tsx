import { User } from 'lucide-react';
import {
  type LoaderFunctionArgs,
  data as dataResponse,
  type ActionFunctionArgs,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useSearchParams, useFetcher } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Checkbox } from '~/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { requireProfile, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { cn } from '~/utils/misc';
import * as React from 'react';

function generateCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const [classes, teacher, availableSchools] = await Promise.all([
    prisma.class.findMany({
      where: { teachers: { some: { id: profile.teacherProfile.id } } },
      select: {
        id: true,
        name: true,
        code: true,
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
      select: { schools: { select: { id: true, name: true } } },
    }),
    prisma.school.findMany({
      where: { teachers: { some: { id: profile.teacherProfile.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
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
  return dataResponse({
    classes,
    teacherSchoolCount,
    schools,
    availableSchools,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }
  const formData = await request.formData();
  const intent = formData.get('intent');
  if (intent === 'create-class') {
    const name = formData.get('name')?.toString().trim() || '';
    const schoolId = formData.get('schoolId')?.toString();
    const period = formData.get('period')?.toString().trim() || null;
    const codeRaw = formData.get('code')?.toString().trim();
    const gradeLevels = (formData.getAll('gradeLevels') as string[]).filter(
      Boolean
    );

    if (!schoolId) {
      return dataResponse({ error: 'School is required' }, { status: 400 });
    }
    if (!name) {
      return dataResponse({ error: 'Name is required' }, { status: 400 });
    }
    if (gradeLevels.length === 0) {
      return dataResponse(
        { error: 'Select at least one grade level' },
        { status: 400 }
      );
    }

    const code =
      codeRaw && codeRaw.length > 0 ? codeRaw.toUpperCase() : generateCode();

    // Ensure teacher belongs to the school
    const teacherInSchool = await prisma.teacherProfile.findFirst({
      where: {
        id: profile.teacherProfile.id,
        schools: { some: { id: schoolId } },
      },
      select: { id: true },
    });
    if (!teacherInSchool) {
      return dataResponse(
        { error: 'Teacher is not assigned to selected school' },
        { status: 400 }
      );
    }

    const created = await prisma.class.create({
      data: {
        name,
        code,
        period,
        gradeLevels,
        school: { connect: { id: schoolId } },
        teachers: { connect: { id: profile.teacherProfile.id } },
      },
      select: { id: true },
    });

    return redirect(`/app/my-classes/${created.id}`);
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function MyClassesRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [generatedCode, setGeneratedCode] = React.useState('');
  const createFetcher = useFetcher();
  const selectedSchoolId = searchParams.get('school') ?? 'all';

  React.useEffect(() => {
    if (
      createFetcher.state === 'idle' &&
      createFetcher.data &&
      !(createFetcher.data as any).error
    ) {
      setIsCreateOpen(false);
    }
  }, [createFetcher.state, createFetcher.data]);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h2>My Classes</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Create and manage your classes.
              </p>
            </div>
            <Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <SheetTrigger asChild>
                <Button size="sm">+ New Class</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Create a Class</SheetTitle>
                </SheetHeader>
                <createFetcher.Form method="post" className="mt-4 space-y-3">
                  <input type="hidden" name="intent" value="create-class" />
                  <div>
                    <label className="text-sm" htmlFor="name">
                      Class name
                    </label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="e.g. Ninth Grade Screwballs"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm" htmlFor="school">
                      School
                    </label>
                    <select
                      id="school"
                      name="schoolId"
                      className="w-full border rounded p-2"
                      required
                    >
                      <option value="">Select a school</option>
                      {data.availableSchools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm">Grade levels</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {['9', '10', '11', '12', 'mixed'].map((g) => (
                        <label
                          key={g}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox name="gradeLevels" value={g} /> {g}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm" htmlFor="period">
                      Period (optional)
                    </label>
                    <Input
                      id="period"
                      name="period"
                      placeholder="e.g. Blue period"
                    />
                  </div>
                  <div>
                    <label className="text-sm" htmlFor="code">
                      Class code (optional)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        id="code"
                        name="code"
                        placeholder="Auto-generate if left blank"
                        defaultValue={generatedCode}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setGeneratedCode(generateCode())}
                      >
                        Generate
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Share this with students to join your class.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={createFetcher.state !== 'idle'}
                  >
                    {createFetcher.state === 'idle'
                      ? 'Create Class'
                      : 'Creating...'}
                  </Button>
                </createFetcher.Form>
              </SheetContent>
            </Sheet>
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
                      {klass.name ||
                        `Grade ${klass.grade} • Period ${klass.period}`}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1 flex items-center">
                      <User className="w-3 h-3 inline-block mr-1" />
                      {klass._count.students}
                    </p>
                  </div>
                  {klass.code ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      Code: {klass.code}
                    </p>
                  ) : null}
                </Link>
              ))}
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
            <p>No classes yet. Click "New Class" to create one.</p>
          </div>
        )}
      </div>
    </section>
  );
}

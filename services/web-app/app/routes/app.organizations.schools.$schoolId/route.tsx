import {
  type ActionFunctionArgs,
  data as dataResponse,
  Link,
  type LoaderFunctionArgs,
} from 'react-router';
import { validationError } from '@rvf/react-router';
import { useFetcher, useLoaderData } from 'react-router';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { ChevronLeft, Settings } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet';
import { Label } from '~/components/ui/label';
import { Input } from '~/components/ui/input';
import React from 'react';
import { prisma } from '~/utils/db.server';
import { requireOwner, requireProfile } from '~/utils/auth.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);

  const school = await prisma.school.findFirst({
    where: { id: params.schoolId, organizationId: profile.organization.id },
    include: {
      classes: {
        include: {
          teachers: {
            include: {
              profile: {
                include: { user: { select: { name: true, email: true } } },
              },
            },
          },
          students: {
            include: {
              profile: {
                include: { user: { select: { name: true, email: true } } },
              },
            },
          },
        },
        orderBy: [{ grade: 'asc' }, { period: 'asc' }],
      },
      teachers: {
        include: {
          profile: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  if (!school) {
    throw new Response('Not Found', { status: 404 });
  }

  return dataResponse({ school });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const user = await requireOwner(request);
  const profile = await requireProfile(request, user.id);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'updateSchool') {
    const name = formData.get('name')?.toString().trim();
    const code = formData.get('code')?.toString().trim();
    if (!name || !code)
      return dataResponse({ error: 'Missing fields' }, { status: 400 });
    const school = await prisma.school.findFirst({
      where: { id: params.schoolId, organizationId: profile.organization.id },
      select: { id: true },
    });
    if (!school) return dataResponse({ error: 'Not found' }, { status: 404 });
    try {
      await prisma.school.update({
        where: { id: school.id },
        data: { name, code },
      });
    } catch (error: unknown) {
      if ((error as any)?.code === 'P2002') {
        return validationError({
          fieldErrors: { code: 'Code must be unique.' },
        });
      }
      throw error;
    }
    return dataResponse({ success: true });
  }

  if (intent === 'updateClass') {
    const classId = formData.get('classId')?.toString();
    const grade = formData.get('grade')?.toString().trim();
    const period = formData.get('period')?.toString().trim();
    const teacherProfileIdRaw = formData.get('teacherProfileId');
    const teacherProfileId = teacherProfileIdRaw
      ? teacherProfileIdRaw.toString().trim()
      : undefined;
    if (!classId || !grade || !period)
      return dataResponse({ error: 'Missing fields' }, { status: 400 });
    const klass = await prisma.class.findFirst({
      where: {
        id: classId,
        school: {
          id: params.schoolId,
          organizationId: profile.organization.id,
        },
      },
      select: { id: true, schoolId: true },
    });
    if (!klass)
      return dataResponse({ error: 'Class not found' }, { status: 404 });

    if (teacherProfileId && teacherProfileId.length > 0) {
      const teacher = await prisma.teacherProfile.findFirst({
        where: {
          id: teacherProfileId,
          profile: { organizationId: profile.organization.id },
        },
        select: { id: true },
      });
      if (!teacher)
        return dataResponse({ error: 'Teacher not found' }, { status: 404 });

      await prisma.class.update({
        where: { id: klass.id },
        data: {
          grade,
          period,
          teachers: { set: [{ id: teacher.id }] },
        },
      });

      // Ensure the teacher is associated with this school
      await prisma.teacherProfile.update({
        where: { id: teacher.id },
        data: { schools: { connect: { id: klass.schoolId } } },
      });
    } else {
      await prisma.class.update({
        where: { id: klass.id },
        data: { grade, period, teachers: { set: [] } },
      });
    }

    return dataResponse({ success: true });
  }

  return dataResponse({ error: 'Invalid intent' }, { status: 400 });
}

export default function SchoolRoute() {
  const { school } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [isSchoolSheetOpen, setIsSchoolSheetOpen] = React.useState(false);
  const [editingClassId, setEditingClassId] = React.useState<string | null>(
    null
  );

  const editingClass =
    school.classes.find((c) => c.id === editingClassId) ?? null;
  const teachers = [...school.teachers].sort((a, b) => {
    const an = a.profile.user.name ?? a.profile.user.email ?? '';
    const bn = b.profile.user.name ?? b.profile.user.email ?? '';
    return an.localeCompare(bn);
  });

  React.useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.success) {
      setIsSchoolSheetOpen(false);
      setEditingClassId(null);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="grid gap-4 p-3 md:p-5">
      <div className="flex justify-between">
        <Button variant="ghost" asChild>
          <Link to="/app/organization">
            <ChevronLeft size={18} />
            All schools
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Sheet open={isSchoolSheetOpen} onOpenChange={setIsSchoolSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Edit School
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Edit School</SheetTitle>
              </SheetHeader>
              <fetcher.Form method="post" className="mt-4 space-y-4">
                <input type="hidden" name="intent" value="updateSchool" />
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={school.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Input
                    id="code"
                    name="code"
                    defaultValue={school.code}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={fetcher.state !== 'idle'}
                >
                  {fetcher.state !== 'idle' ? 'Saving...' : 'Save Changes'}
                </Button>
              </fetcher.Form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-muted">
          <CardHeader>
            <CardTitle>School Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Name
                </dt>
                <dd className="text-base font-medium">{school.name}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Code
                </dt>
                <dd className="text-base font-medium">{school.code}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Classes
                </dt>
                <dd className="text-base">{school.classes.length}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Teachers
                </dt>
                <dd className="text-base">{school.teachers.length}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted">
        <CardHeader>
          <CardTitle>Classes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Grade</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Students</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {school.classes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No classes found for this school.
                  </TableCell>
                </TableRow>
              ) : (
                school.classes.map((klass) => {
                  const teacherName =
                    klass.teachers[0]?.profile.user.name ??
                    klass.teachers[0]?.profile.user.email ??
                    '—';
                  const studentsLine =
                    klass.students
                      .map(
                        (s) =>
                          s.profile.user.name ??
                          s.profile.user.email ??
                          'Student'
                      )
                      .join(', ') || '—';
                  return (
                    <TableRow key={klass.id}>
                      <TableCell>{klass.grade}</TableCell>
                      <TableCell>{klass.period}</TableCell>
                      <TableCell>{teacherName}</TableCell>
                      <TableCell className="max-w-[400px] truncate">
                        {studentsLine}
                      </TableCell>
                      <TableCell className="text-right">
                        <Sheet
                          open={editingClassId === klass.id}
                          onOpenChange={(o) =>
                            setEditingClassId(o ? klass.id : null)
                          }
                        >
                          <SheetTrigger asChild>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </SheetTrigger>
                          <SheetContent>
                            <SheetHeader>
                              <SheetTitle>Edit Class</SheetTitle>
                            </SheetHeader>
                            <fetcher.Form
                              method="post"
                              className="mt-4 space-y-4"
                            >
                              <input
                                type="hidden"
                                name="intent"
                                value="updateClass"
                              />
                              <input
                                type="hidden"
                                name="classId"
                                value={klass.id}
                              />
                              <div className="space-y-2">
                                <Label htmlFor="grade">Grade</Label>
                                <Input
                                  id="grade"
                                  name="grade"
                                  defaultValue={klass.grade}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="period">Period</Label>
                                <Input
                                  id="period"
                                  name="period"
                                  defaultValue={klass.period}
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="teacherProfileId">
                                  Teacher
                                </Label>
                                <select
                                  id="teacherProfileId"
                                  name="teacherProfileId"
                                  defaultValue={klass.teachers[0]?.id ?? ''}
                                  className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                                >
                                  <option value="">— None —</option>
                                  {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.profile.user.name ??
                                        t.profile.user.email}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <Button
                                type="submit"
                                className="w-full"
                                disabled={fetcher.state !== 'idle'}
                              >
                                {fetcher.state !== 'idle'
                                  ? 'Saving...'
                                  : 'Save Changes'}
                              </Button>
                            </fetcher.Form>
                          </SheetContent>
                        </Sheet>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

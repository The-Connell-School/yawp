import { Plus, User } from 'lucide-react';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Button } from '~/components/ui/button';
import {
  ClassManageSheet,
} from '~/components/class-manage-sheet';
import {
  TeacherClassCard,
} from '~/components/teacher-class-card';
import { StudentClassCard } from '~/components/student-class-card';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { generateClassCode } from '~/utils/class';
import { generateClassCardGradientKey } from '~/utils/class-card-gradient';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { pickClassArtKeyForOrganization } from '~/utils/class-art-assignment.server';
import { getStudentEnrolledClasses } from '~/utils/student-classes.server';

async function getTeacherSchoolIds(membershipId: string) {
  const teacher = await prisma.orgMembership.findUnique({
    where: { id: membershipId, role: 'TEACHER' },
    select: { schools: { select: { id: true } } },
  });
  return new Set(teacher?.schools.map((school) => school.id) ?? []);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role === 'STUDENT') {
    const studentClasses = await getStudentEnrolledClasses(profile.id);
    return dataResponse({ role: 'STUDENT' as const, studentClasses });
  }

  if (profile.role !== "TEACHER") {
    throw redirect('/app');
  }

  const [classes, teacherSchools] = await Promise.all([
    prisma.class.findMany({
      where: {
        teachers: { some: { id: profile.id } },
        isArchived: false,
      },
      select: {
        id: true,
        schoolId: true,
        schoolYear: true,
        grade: true,
        period: true,
        title: true,
        code: true,
        classArtIndex: true,
        classArtKey: true,
        school: { select: { id: true, name: true } },
        _count: { select: { students: true, classAssignments: true } },
      },
      orderBy: [
        { school: { name: 'asc' } },
        { grade: 'asc' },
        { period: 'asc' },
      ],
    }),
    prisma.orgMembership.findUnique({
      where: { id: profile.id, role: 'TEACHER' },
      select: {
        schools: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
      },
    }),
  ]);

  const classStats = await Promise.all(
    classes.map(async (klass) => ({
      classId: klass.id,
      ...(await getTeacherClassCardStats(klass.id)),
    }))
  );

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
    return {
      ...klass,
      legacyClassArtIndex: klass.classArtIndex,
      stats,
      _count: {
        students: klass._count.students,
        assignments: klass._count.classAssignments,
      },
    };
  });

  return dataResponse({
    role: 'TEACHER' as const,
    classes: classesWithStats,
    teacherSchoolCount: teacherSchools?.schools.length ?? 0,
    schools,
    manageSchools: teacherSchools?.schools ?? [],
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== "TEACHER") {
    return dataResponse({ error: 'Only teachers can manage classes.' }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  const allowedSchoolIds = await getTeacherSchoolIds(profile.id);

  if (intent === 'create-class') {
    const schoolId = formData.get('schoolId') as string;
    const schoolYear = formData.get('schoolYear') as string;
    const grade = formData.get('grade') as string;
    const period = formData.get('period') as string;
    const title = (formData.get('title') as string)?.trim() || null;
    let code = (formData.get('code') as string)?.trim().toUpperCase() || '';

    if (!schoolId || !schoolYear || !grade || !period) {
      return dataResponse({ error: 'All required fields must be filled.' }, { status: 400 });
    }

    if (!allowedSchoolIds.has(schoolId)) {
      return dataResponse({ error: 'Invalid school for your account.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse({ error: 'School year must be YYYY-YYYY.' }, { status: 400 });
    }

    if (!code) code = generateClassCode();

    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
      return dataResponse(
        { error: 'Code must be 3-10 alphanumeric characters.' },
        { status: 400 }
      );
    }

    try {
      await prisma.class.create({
        data: {
          schoolId,
          schoolYear,
          grade,
          period,
          title,
          code,
          cardGradientKey: generateClassCardGradientKey(code),
          classArtKey: await pickClassArtKeyForOrganization(
            profile.organization.id
          ),
          teachers: { connect: [{ id: profile.id }] },
        },
      });
      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return dataResponse(
          { error: 'Class code already in use. Choose a different code.' },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  if (intent === 'edit-class') {
    const classId = formData.get('classId') as string;
    const schoolId = formData.get('schoolId') as string;
    const schoolYear = formData.get('schoolYear') as string;
    const grade = formData.get('grade') as string;
    const period = formData.get('period') as string;
    const title = (formData.get('title') as string)?.trim() || null;
    const code = (formData.get('code') as string)?.trim().toUpperCase() || '';

    if (!classId || !schoolId || !schoolYear || !grade || !period || !code) {
      return dataResponse({ error: 'All required fields must be filled.' }, { status: 400 });
    }

    if (!allowedSchoolIds.has(schoolId)) {
      return dataResponse({ error: 'Invalid school for your account.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse({ error: 'School year must be YYYY-YYYY.' }, { status: 400 });
    }

    if (!/^[A-Z0-9]{3,10}$/.test(code)) {
      return dataResponse(
        { error: 'Code must be 3-10 alphanumeric characters.' },
        { status: 400 }
      );
    }

    const existingClass = await prisma.class.findFirst({
      where: {
        id: classId,
        teachers: { some: { id: profile.id } },
      },
      select: {
        teachers: { select: { id: true } },
      },
    });

    if (!existingClass) {
      return dataResponse({ error: 'Class not found.' }, { status: 404 });
    }

    try {
      await prisma.class.update({
        where: { id: classId },
        data: {
          schoolId,
          schoolYear,
          grade,
          period,
          title,
          code,
          teachers: {
            set: existingClass.teachers.map((teacher) => ({ id: teacher.id })),
          },
        },
      });
      return dataResponse({ success: true });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return dataResponse(
          { error: 'Class code already in use. Choose a different code.' },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  return dataResponse({ error: 'Unknown action.' }, { status: 400 });
}

function StudentMyClassesView({
  studentClasses,
}: {
  studentClasses: Array<Parameters<typeof StudentClassCard>[0]['klass']>;
}) {
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>My Classes</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[460px]">
              The classes you&apos;re enrolled in.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full min-w-0 max-w-screen-lg px-3 py-4 pb-24 sm:px-5">
        {studentClasses.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {studentClasses.map((klass) => (
              <StudentClassCard key={klass.id} klass={klass} />
            ))}
          </div>
        ) : (
          <NoDataPlaceholder
            title="No classes yet"
            subtitle="When your teacher adds you to a class, it will appear here."
          />
        )}
      </div>
    </section>
  );
}

export default function MyClassesRoute() {
  const data = useLoaderData<typeof loader>();

  if (data.role === 'STUDENT') {
    return <StudentMyClassesView studentClasses={data.studentClasses} />;
  }

  return <TeacherMyClassesView data={data} />;
}

function TeacherMyClassesView({
  data,
}: {
  data: Extract<
    ReturnType<typeof useLoaderData<typeof loader>>,
    { role: 'TEACHER' }
  >;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSchoolId = searchParams.get('school') ?? 'all';
  const [sheetOpen, setSheetOpen] = useState(false);

  const filteredClasses = data.classes.filter((klass) =>
    selectedSchoolId === 'all' ? true : klass.school?.id === selectedSchoolId
  );

  const openCreate = () => {
    setSheetOpen(true);
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2>My Classes</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[460px]">
                Your classes at a glance. Open a class to manage students and
                assignments.
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Create Class
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full min-w-0 max-w-screen-lg px-3 py-4 pb-24 sm:px-5">
        {data.schools.length > 1 ? (
          <div className="mb-4 min-w-0">
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
              <div className="overflow-x-auto no-scrollbar">
                <TabsList className="inline-flex h-auto w-max max-w-none flex-nowrap justify-start">
                  <TabsTrigger value="all">All schools</TabsTrigger>
                  {data.schools.map((s) => (
                    <TabsTrigger key={s.id} value={s.id}>
                      {s.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          </div>
        ) : null}

        {filteredClasses.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClasses.map((klass) => (
              <TeacherClassCard key={klass.id} klass={klass} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <User className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No classes yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first class to get started.
            </p>
            <Button size="sm" className="mt-4" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create Class
            </Button>
          </div>
        )}
      </div>

      <ClassManageSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingClass={null}
        schools={data.manageSchools}
      />
    </section>
  );
}

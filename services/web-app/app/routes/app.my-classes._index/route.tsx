import { Plus, User } from 'lucide-react';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useFetcher, useLoaderData, useSearchParams } from 'react-router';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Badge } from '~/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
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
import { assertCanCreateClassForOrganizationPlan } from '~/utils/assignment-quota.server';
import { getEntitlements } from '~/utils/entitlements.server';
import { prisma } from '~/utils/db.server.js';
import { generateClassCode } from '~/utils/class';
import { studentJoinTokenForClassCreate } from '~/utils/class-student-join-token.server';
import { generateClassCardGradientKey } from '~/utils/class-card-gradient';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { pickClassArtKeyForOrganization } from '~/utils/class-art-assignment.server';
import { getStudentEnrolledClasses } from '~/utils/student-classes.server';
import { ALL_SCHOOL_YEARS } from '~/utils/school-year';
import { resolveTeacherSchoolYearScope } from '~/utils/school-year-scope.server';
import { resolveStudentSchoolYearScope } from '~/utils/school-year-scope.server';

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
    const studentClasses = await getStudentEnrolledClasses(
      profile.id,
      await resolveStudentSchoolYearScope(request, profile.id)
    );
    return dataResponse({ role: 'STUDENT' as const, studentClasses });
  }

  if (profile.role !== "TEACHER") {
    throw redirect('/app');
  }

  // A teacher works inside one school year, chosen once in the sidebar and
  // honoured everywhere. Earlier years are still there behind that control —
  // nothing is archived to get them out of the way, because archiving would
  // take the work away from students too.
  const selectedSchoolYear = await resolveTeacherSchoolYearScope(
    request,
    profile.id
  );

  const [classes, teacherSchools] = await Promise.all([
    prisma.class.findMany({
      where: {
        teachers: { some: { id: profile.id } },
        isArchived: false,
        ...(selectedSchoolYear === ALL_SCHOOL_YEARS
          ? {}
          : { schoolYear: selectedSchoolYear }),
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

  const entitlements = getEntitlements(profile.organization);
  let classCreateBlockedMessage: string | null = null;
  if (entitlements.activeClassCap != null) {
    const activeClassCount = await prisma.class.count({
      where: {
        isArchived: false,
        school: { organizationId: profile.organization.id },
      },
    });
    if (!entitlements.canCreateClass({ currentActiveClasses: activeClassCount })) {
      classCreateBlockedMessage =
        'Free classroom accounts include one class. Archive your existing class or upgrade to add another.';
    }
  }

  return dataResponse({
    role: 'TEACHER' as const,
    classes: classesWithStats,
    selectedSchoolYear,
    teacherSchoolCount: teacherSchools?.schools.length ?? 0,
    schools,
    manageSchools: teacherSchools?.schools ?? [],
    classCreateBlockedMessage,
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
    const grade = (formData.get('grade') as string)?.trim() || null;
    const period = (formData.get('period') as string)?.trim() || null;
    const title = (formData.get('title') as string)?.trim() || null;
    let code = (formData.get('code') as string)?.trim().toUpperCase() || '';

    if (!schoolId || !schoolYear) {
      return dataResponse({ error: 'All required fields must be filled.' }, { status: 400 });
    }

    if (!allowedSchoolIds.has(schoolId)) {
      return dataResponse({ error: 'Invalid school for your account.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse({ error: 'School year must be YYYY-YYYY.' }, { status: 400 });
    }

    if (!code) code = generateClassCode();

    try {
      const classArtKey = await pickClassArtKeyForOrganization(
        profile.organization.id
      );
      await prisma.$transaction(async (tx) => {
        await assertCanCreateClassForOrganizationPlan(tx, profile.organization);
        await tx.class.create({
          data: {
            schoolId,
            schoolYear,
            grade,
            period,
            title,
            code,
            studentJoinToken: studentJoinTokenForClassCreate(
              profile.organization.plan
            ),
            cardGradientKey: generateClassCardGradientKey(code),
            classArtKey,
            teachers: { connect: [{ id: profile.id }] },
          },
        });
      });
      return dataResponse({ success: true });
    } catch (error: any) {
      if (error instanceof Error && error.message.includes('Free classroom accounts include one class')) {
        return dataResponse({ error: error.message }, { status: 403 });
      }
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
    const grade = (formData.get('grade') as string)?.trim() || null;
    const period = (formData.get('period') as string)?.trim() || null;
    const title = (formData.get('title') as string)?.trim() || null;
    const code = (formData.get('code') as string)?.trim().toUpperCase() || '';

    if (!classId || !schoolId || !schoolYear || !code) {
      return dataResponse({ error: 'All required fields must be filled.' }, { status: 400 });
    }

    if (!allowedSchoolIds.has(schoolId)) {
      return dataResponse({ error: 'Invalid school for your account.' }, { status: 400 });
    }

    if (!/^\d{4}-\d{4}$/.test(schoolYear)) {
      return dataResponse({ error: 'School year must be YYYY-YYYY.' }, { status: 400 });
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
  const scopedToOneYear = data.selectedSchoolYear !== ALL_SCHOOL_YEARS;
  const yearScopeFetcher = useFetcher();

  const openCreate = () => {
    setSheetOpen(true);
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2>My Classes</h2>
                {scopedToOneYear ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className="bg-background font-medium"
                    data-testid="my-classes-year-badge"
                  >
                    {data.selectedSchoolYear.replace('-', '–')}
                  </Badge>
                ) : null}
              </div>
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
              <TeacherClassCard
                key={klass.id}
                klass={klass}
                showSchoolYear={!scopedToOneYear}
              />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed py-12 text-center"
            data-testid="my-classes-empty"
          >
            <User className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">
              {scopedToOneYear
                ? `No classes for ${data.selectedSchoolYear.replace('-', '–')}`
                : 'No classes yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {scopedToOneYear
                ? 'Create a class for this year, or change the school year in Settings.'
                : 'Create your first class to get started.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create Class
              </Button>
              {scopedToOneYear ? (
                <yearScopeFetcher.Form method="POST" action="/api/school-year">
                  <input
                    type="hidden"
                    name="year"
                    value={ALL_SCHOOL_YEARS}
                  />
                  <Button size="sm" variant="outline" type="submit">
                    View all years
                  </Button>
                </yearScopeFetcher.Form>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <ClassManageSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingClass={null}
        schools={data.manageSchools}
        classCreateBlockedMessage={data.classCreateBlockedMessage}
        preferredSchoolYear={
          data.selectedSchoolYear !== ALL_SCHOOL_YEARS
            ? data.selectedSchoolYear
            : null
        }
      />
    </section>
  );
}

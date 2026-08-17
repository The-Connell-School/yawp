import {
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { useLoaderData, useRouteLoaderData } from 'react-router';
import { useState } from 'react';
import type { Route as RootRoute } from '../../+types/root';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { NoDataPlaceholder } from '~/components/no-data-placeholder.js';
import { useUser } from '~/hooks/useUser.js';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import type { TeacherClassCardData } from '~/components/teacher-class-card';
import { StudentClassCard } from '~/components/student-class-card';
import { StudentWriteSomethingNew } from '~/components/student-write-something-new';
import { getTeacherClassCardStats } from '~/utils/teacher-class-card-stats.server';
import { getTeacherRecentActiveClassIds } from '~/utils/teacher-dashboard-recent-classes.server';
import { getStudentEnrolledClasses } from '~/utils/student-classes.server';
import {
  resolveSchoolYearScopeForMembership,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import { AssignmentsAtAGlance } from './components/assignments-at-a-glance';
import { ClassesAtAGlance } from './components/classes-at-a-glance';
import { TeacherGradingAtAGlance } from './components/teacher-grading-at-a-glance';
import { formatClassLabel } from '~/utils/class-display';

const DASHBOARD_MAX_TEACHER_CLASSES = 6;

export type AssignmentTypeRow = {
  id: string;
  title: string;
  systemKey?: string | null;
  collaborationSupported?: boolean;
  image?: { id: string } | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const useStudentExperience = profile.role === 'STUDENT';
  // The dashboard is the first thing either role sees, so it has to obey the
  // same school year everything else does.
  const schoolYearScope = await resolveSchoolYearScopeForMembership(
    request,
    profile
  );

  const studentClassCount =
    useStudentExperience
      ? ((
          await prisma.orgMembership.findUnique({
            where: { id: profile.id },
            select: { _count: { select: { classesAsStudent: true } } },
          })
        )?._count.classesAsStudent ?? 0)
      : 0;

  const isStudentOnlyWithNoClasses =
    useStudentExperience &&
    !profile.isOrgOwner &&
    studentClassCount === 0;

  if (isStudentOnlyWithNoClasses) {
    return redirect('/enter-code');
  }

  // A student may only start the assignment types their own teachers can assign, so the
  // scopes are built per teacher of each class the student is in — the same scope shape the
  // teacher-side dashboard uses, just resolved through enrollment instead of ownership.
  let studentAssignmentClassIds: string[] = [];
  let studentAssignmentTypeScopes: {
    organizationId: string;
    schoolId: string;
    teacherProfileId: string;
  }[] = [];
  if (useStudentExperience) {
    const studentClasses = await prisma.class.findMany({
      where: {
        students: { some: { id: profile.id } },
        ...schoolYearWhere(schoolYearScope),
      },
      select: {
        id: true,
        school: { select: { id: true, organizationId: true } },
        teachers: { select: { id: true } },
      },
    });
    studentAssignmentClassIds = studentClasses.map((klass) => klass.id);
    studentAssignmentTypeScopes = studentClasses.flatMap((klass) =>
      klass.teachers.map((teacher) => ({
        organizationId: klass.school.organizationId,
        schoolId: klass.school.id,
        teacherProfileId: teacher.id,
      }))
    );
  }

  const teacherAssignmentClassScopes = !useStudentExperience
    ? await prisma.class
        .findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
          },
          select: {
            id: true,
            school: { select: { id: true, organizationId: true } },
          },
        })
        .then((classes) =>
          classes.map((klass) => ({
            id: klass.id,
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
            teacherProfileId: profile.id,
          }))
        )
    : [];
  const assignmentsEnabled =
    useStudentExperience
      ? studentAssignmentClassIds.length > 0
      : teacherAssignmentClassScopes.length > 0;

  const enrolledClasses = useStudentExperience
    ? await getStudentEnrolledClasses(profile.id, schoolYearScope)
    : [];

  const [assignmentTypes, teacherClasses] = await Promise.all([
    !useStudentExperience || studentAssignmentTypeScopes.length === 0
      ? ([] as AssignmentTypeRow[])
      : getAvailableAssignmentTypesForScopes<AssignmentTypeRow>({
          scopes: studentAssignmentTypeScopes,
          select: {
            id: true,
            title: true,
            collaborationSupported: true,
            systemKey: true,
            image: { select: { id: true } },
          },
          orderBy: { position: 'asc' },
        }),
    // Teacher classes and recent ordering
    !useStudentExperience
      ? prisma.class.findMany({
          where: {
            teachers: { some: { id: profile.id } },
            isArchived: false,
            ...schoolYearWhere(schoolYearScope),
          },
          select: {
            id: true,
            grade: true,
            period: true,
            title: true,
            classArtIndex: true,
            classArtKey: true,
            school: { select: { id: true, name: true, organizationId: true } },
            _count: {
              select: { students: true, teachers: true, classAssignments: true },
            },
          },
        })
      : [],
  ]);

  // Sort teacher classes with recent activity first.
  let teacherClassesOrdered: typeof teacherClasses = teacherClasses;
  let recentActiveClassIds: string[] = [];
  if (!useStudentExperience && teacherClasses.length > 0) {
    recentActiveClassIds = await getTeacherRecentActiveClassIds({
      teacherClassIds: teacherClasses.map((klass) => klass.id),
    });
    const recentClassIdRank = new Map(
      recentActiveClassIds.map((classId, index) => [classId, index])
    );
    teacherClassesOrdered = [...teacherClasses].sort((a, b) => {
      const aRank = recentClassIdRank.get(a.id);
      const bRank = recentClassIdRank.get(b.id);

      if (aRank !== undefined && bRank !== undefined) {
        return aRank - bRank;
      }
      if (aRank !== undefined) {
        return -1;
      }
      if (bRank !== undefined) {
        return 1;
      }

      return (
        (a.title ?? '').localeCompare(b.title ?? '') ||
        (a.grade ?? '').localeCompare(b.grade ?? '') ||
        (a.period ?? '').localeCompare(b.period ?? '')
      );
    });
  }

  const teacherClassStatsById = !useStudentExperience
    ? new Map(
        await Promise.all(
          teacherClasses.map(async (klass) => [
            klass.id,
            {
              stats: await getTeacherClassCardStats(klass.id),
              assignments: klass._count.classAssignments,
            },
          ] as const)
        )
      )
    : new Map<
        string,
        {
          stats: Awaited<ReturnType<typeof getTeacherClassCardStats>>;
          assignments: number;
        }
      >();

  const teacherClassCards: TeacherClassCardData[] = !useStudentExperience
    ? teacherClassesOrdered
        .map((klass) => {
          const classStats = teacherClassStatsById.get(klass.id);
          return {
            id: klass.id,
            grade: klass.grade,
            period: klass.period,
            title: klass.title,
            classArtKey: klass.classArtKey,
            legacyClassArtIndex: klass.classArtIndex,
            school: { id: klass.school.id, name: klass.school.name },
            _count: {
              students: klass._count.students,
              assignments: klass._count.classAssignments,
            },
            stats: classStats?.stats,
          };
        })
        .slice(0, DASHBOARD_MAX_TEACHER_CLASSES)
    : [];

  const teacherWorkspaceClassStats = !useStudentExperience
    ? teacherClasses.map((klass) => {
        const classStats = teacherClassStatsById.get(klass.id);
        return {
          assignments: classStats?.assignments ?? 0,
          ungradedCount: classStats?.stats.ungradedCount ?? 0,
          gradedUnreleasedCount: classStats?.stats.gradedUnreleasedCount ?? 0,
        };
      })
    : [];

  const teacherAssignmentTypes =
    !useStudentExperience &&
    assignmentsEnabled &&
    teacherAssignmentClassScopes.length > 0
      ? await getAvailableAssignmentTypesForScopes<AssignmentTypeRow>({
          scopes: teacherAssignmentClassScopes,
          select: {
            id: true,
            title: true,
            collaborationSupported: true,
            systemKey: true,
            image: { select: { id: true } },
          },
          orderBy: { position: 'asc' },
        })
      : [];

  const enabledTeacherClasses =
    !useStudentExperience && assignmentsEnabled ? teacherClassesOrdered : [];
  const assignmentCreationClasses = enabledTeacherClasses;
  const assignmentCreationTypes = teacherAssignmentTypes
    .filter((type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY)
    .map((type) => ({
      id: type.id,
      title: type.title,
      // AssignmentTypeRow is shared with student-side selects that do not ask
      // for this column, so it is optional there and defaulted here.
      collaborationSupported: type.collaborationSupported ?? false,
    }));

  return dataResponse({
    assignmentTypes,
    enrolledClasses,
    teacherClasses: teacherClassesOrdered,
    assignmentsEnabled,
    teacherClassCards,
    totalTeacherClassCount: teacherClasses.length,
    teacherWorkspaceClassStats,
    teacherAssignmentTypes,
    assignmentCreationClasses: assignmentCreationClasses.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),
    assignmentCreationTypes,
  });
}

export default function AppRoute() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();
  const rootData =
    useRouteLoaderData<RootRoute.ComponentProps['loaderData']>('root');
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [createAssignmentTypeId, setCreateAssignmentTypeId] = useState<
    string | undefined
  >();
  const isTeacher = user.selectedMembership?.role === 'TEACHER';
  const assignmentsEnabled = data.assignmentsEnabled ?? false;

  if (isTeacher) {
    const needsGradingCount = data.teacherWorkspaceClassStats.reduce(
      (total, klass) => total + (klass.ungradedCount ?? 0),
      0
    );
    const readyToReleaseCount = data.teacherWorkspaceClassStats.reduce(
      (total, klass) => total + (klass.gradedUnreleasedCount ?? 0),
      0
    );

    return (
      <section
        data-testid="app._index"
        className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
      >
        <div className="flex w-full justify-between border-b bg-secondary">
          <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
            <div className="flex flex-col">
              <h2>Welcome, {user.name}!</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Your classes, assignments, and grading in one place.
              </p>
            </div>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
          <ClassesAtAGlance
            classes={data.teacherClassCards}
            totalClassCount={data.totalTeacherClassCount}
          />
          {assignmentsEnabled ? (
            <>
              <AssignmentsAtAGlance
                assignmentTypes={data.teacherAssignmentTypes}
                onCreateAssignment={() => {
                  setCreateAssignmentTypeId(undefined);
                  setIsCreateSheetOpen(true);
                }}
                onCreateAssignmentForType={(assignmentTypeId) => {
                  setCreateAssignmentTypeId(assignmentTypeId);
                  setIsCreateSheetOpen(true);
                }}
              />
              <AssignmentCreationSheet
                open={isCreateSheetOpen}
                onOpenChange={(open) => {
                  setIsCreateSheetOpen(open);
                  if (!open) {
                    setCreateAssignmentTypeId(undefined);
                  }
                }}
                entryPoint="dashboard"
                assignmentTypes={data.assignmentCreationTypes}
                teacherClasses={data.assignmentCreationClasses}
                initialAssignmentTypeId={createAssignmentTypeId}
              />
            </>
          ) : null}
          <TeacherGradingAtAGlance
            needsGradingCount={needsGradingCount}
            readyToReleaseCount={readyToReleaseCount}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="app._index"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col">
              <h2>Welcome, {user.name}!</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
                Welcome to your dashboard. Here you can view your classes and
                manage your writing.
              </p>
            </div>
            <StudentWriteSomethingNew
              assignmentTypes={data.assignmentTypes}
            />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-lg px-3 py-3 pb-24 sm:px-5">
        <div className="flex flex-col">
          <p className="my-2 text-foreground/60">Classes</p>
          {data.enrolledClasses.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {data.enrolledClasses.map((klass) => (
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
      </div>
    </section>
  );
}

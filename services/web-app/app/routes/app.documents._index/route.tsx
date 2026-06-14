import { type LoaderFunctionArgs, redirect } from 'react-router';
import { useLoaderData, useSearchParams } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TeacherDocumentWorkPanel,
  type TeacherDocumentWorkFilters,
} from '~/components/teacher-document-work/teacher-document-work-panel';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForScope } from '~/utils/feature-flags.server';
import { buildTeacherClassWorkDocumentWhere } from '~/utils/class-assignment-scope.server';
import {
  TEACHER_DOCUMENT_STATUSES,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  parseDocumentGroupMode,
  type DocumentGroupMode,
} from '~/utils/teacher-document-work-grouping';
import {
  buildStudentFilterOptionsFromDocuments,
  dedupeAssignmentFilterOptions,
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
} from '~/utils/teacher-document-work-filter-options';
import {
  countTeacherDocumentWorkStatuses,
  formatClassLabel,
  type TeacherDocumentWorkClassSummary,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import {
  DEFAULT_DOCUMENT_WORK_SORT,
  type DocumentWorkSort,
} from '~/utils/teacher-document-work-sort';
import type { Prisma } from '@app/prisma';
import {
  mergeStoredStudentWorkSearchParams,
  mergeStudentWorkViewPreferences,
  readStudentWorkViewPreferences,
  getStoredCollapsedStudentWorkGroups,
  withStoredCollapsedStudentWorkGroups,
} from './student-work-view-preferences';

export const handle = { breadcrumb: 'Documents' };

function resolveDocumentClass(document: {
  classAssignment?: {
    class: TeacherDocumentWorkClassSummary;
  } | null;
  membership: {
    classesAsStudent: TeacherDocumentWorkClassSummary[];
  };
}) {
  if (document.classAssignment?.class) {
    return document.classAssignment.class;
  }

  return document.membership.classesAsStudent[0] ?? null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== "TEACHER") {
    return redirect('/app');
  }

  const url = new URL(request.url);
  const studentIds = parseDocumentWorkFilterIds(url.searchParams.get('student'));
  const selectedClassIds = parseDocumentWorkFilterIds(
    url.searchParams.get('class')
  );
  const assignmentIds = parseDocumentWorkFilterIds(
    url.searchParams.get('assignment')
  );
  const statusParam = url.searchParams.get('status') ?? 'all';
  const status: TeacherDocumentStatus | 'all' =
    TEACHER_DOCUMENT_STATUSES.includes(statusParam as TeacherDocumentStatus)
      ? (statusParam as TeacherDocumentStatus)
      : 'all';
  const group = parseDocumentGroupMode(url.searchParams.get('group'));
  const query = (url.searchParams.get('q') ?? '').trim();

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: profile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { id: true, name: true, organizationId: true } },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const classIds = classes.map((klass) => klass.id);

  const [classAssignments, isDocumentSubmissionEnabled] = await Promise.all([
    prisma.classAssignment.findMany({
      where: { classId: { in: classIds } },
      select: {
        id: true,
        classId: true,
        createdAt: true,
        assignment: { select: { id: true, title: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
    isDocumentSubmissionEnabledForScope({
      schoolIds: classes.map((klass) => klass.school.id),
      organizationIds: [profile.organization.id],
      teacherProfileIds: [profile.id],
      classIds,
    }),
  ]);

  const documentWhere: Prisma.DocumentWhereInput =
    buildTeacherClassWorkDocumentWhere({ classIds });

  const allDocuments = await prisma.document.findMany({
    where: documentWhere,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
          submitForGrade: true,
          pointValue: true,
        },
      },
      classAssignment: {
        select: {
          class: {
            select: {
              id: true,
              grade: true,
              period: true,
              title: true,
            },
          },
        },
      },
      membership: {
        select: {
          id: true,
          user: { select: { id: true, name: true, email: true } },
          classesAsStudent: {
            where: { id: { in: classIds } },
            select: {
              id: true,
              grade: true,
              period: true,
              title: true,
            },
          },
        },
      },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          title: true,
          score: true,
          feedback: true,
          rubricScores: true,
          overallComment: true,
          numericPercentage: true,
          letterGrade: true,
          gradedAt: true,
          releasedAt: true,
          submittedAt: true,
          createdAt: true,
        },
      },
      _count: { select: { submissions: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 250,
  });

  const documents: TeacherDocumentWorkRow[] = allDocuments.map((document) => {
    const submissions = document.submissions;
    return {
      id: document.id,
      title: document.title,
      updatedAt: new Date(document.updatedAt),
      membership: document.membership,
      assignment: document.assignment,
      resolvedClass: resolveDocumentClass(document),
      submissions,
      latestSubmission: submissions[0] ?? null,
      submissionCount: document._count.submissions,
    };
  });

  const students = buildStudentFilterOptionsFromDocuments(documents);
  const assignments = dedupeAssignmentFilterOptions(
    classAssignments.map((classAssignment) => ({
      id: classAssignment.assignment.id,
      label: classAssignment.assignment.title ?? 'Untitled assignment',
      classId: classAssignment.classId,
      createdAt: classAssignment.createdAt,
    }))
  );

  return {
    documents,
    statusCounts: countTeacherDocumentWorkStatuses(documents),
    classes: classes.map((klass) => ({
      id: klass.id,
      label: formatClassLabel(klass),
    })),
    students,
    assignments,
    isDocumentSubmissionEnabled,
    filters: {
      studentIds,
      classIds: selectedClassIds,
      assignmentIds,
      status,
      group,
      query,
    } satisfies TeacherDocumentWorkFilters,
  };
}

export default function StudentWorkRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [documentSort, setDocumentSort] = useState<DocumentWorkSort>(
    DEFAULT_DOCUMENT_WORK_SORT
  );
  const hasHydratedStudentWorkPreferences = useRef(false);
  const hasHydratedCollapsedStudentWorkGroups = useRef(false);
  const hasHydratedDocumentSort = useRef(false);

  const exitTo = `/app/documents${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const documentGroupMode = data.filters.group;

  useEffect(() => {
    if (hasHydratedStudentWorkPreferences.current) {
      return;
    }

    hasHydratedStudentWorkPreferences.current = true;
    const merged = mergeStoredStudentWorkSearchParams({
      searchParams,
      storedPreferences: readStudentWorkViewPreferences(),
    });

    if (merged.shouldReplace) {
      setSearchParams(merged.searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!hasHydratedStudentWorkPreferences.current) {
      return;
    }

    if (documentGroupMode === 'none') {
      setCollapsedGroups(new Set());
      return;
    }

    if (hasHydratedCollapsedStudentWorkGroups.current) {
      return;
    }

    hasHydratedCollapsedStudentWorkGroups.current = true;
    setCollapsedGroups(
      getStoredCollapsedStudentWorkGroups(
        readStudentWorkViewPreferences(),
        documentGroupMode
      )
    );
  }, [documentGroupMode]);

  useEffect(() => {
    if (!hasHydratedStudentWorkPreferences.current || hasHydratedDocumentSort.current) {
      return;
    }

    hasHydratedDocumentSort.current = true;
    const storedSort = readStudentWorkViewPreferences().documentSort;
    if (storedSort) {
      setDocumentSort(storedSort);
    }
  }, [documentGroupMode]);

  const persistStudentWorkViewPreferences = (next: URLSearchParams) => {
    mergeStudentWorkViewPreferences(next);
  };

  const persistCollapsedStudentWorkGroups = (collapsedGroupKeys: Set<string>) => {
    if (documentGroupMode === 'none') return;

    mergeStudentWorkViewPreferences(searchParams, {
      collapsedGroups: withStoredCollapsedStudentWorkGroups(
        readStudentWorkViewPreferences(),
        documentGroupMode,
        collapsedGroupKeys
      ).collapsedGroups,
    });
  };

  const handleDocumentSortChange = (next: DocumentWorkSort) => {
    setDocumentSort(next);
    mergeStudentWorkViewPreferences(searchParams, { documentSort: next });
  };

  const filters = useMemo(
    (): TeacherDocumentWorkFilters => ({
      studentIds: data.filters.studentIds,
      classIds: data.filters.classIds,
      assignmentIds: data.filters.assignmentIds,
      status: data.filters.status,
      group: data.filters.group,
      query: data.filters.query,
    }),
    [data.filters]
  );

  const updateFilters = (updates: Partial<TeacherDocumentWorkFilters>) => {
    const next = new URLSearchParams(searchParams);

    const apply = (
      key: string,
      value: string | DocumentGroupMode | TeacherDocumentStatus | 'all'
    ) => {
      if (!value || value === 'all' || value === 'none') {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    };

    const applyIds = (key: string, ids: string[] | undefined) => {
      const serialized = serializeDocumentWorkFilterIds(ids ?? []);
      if (!serialized) {
        next.delete(key);
      } else {
        next.set(key, serialized);
      }
    };

    if ('studentIds' in updates) {
      applyIds('student', updates.studentIds);
    }
    if ('classIds' in updates) {
      applyIds('class', updates.classIds);
    }
    if ('assignmentIds' in updates) {
      applyIds('assignment', updates.assignmentIds);
    }
    if ('status' in updates) {
      apply('status', updates.status ?? 'all');
    }
    if ('group' in updates) {
      apply('group', updates.group ?? 'none');
    }
    if ('query' in updates) {
      apply('q', updates.query ?? '');
    }

    persistStudentWorkViewPreferences(next);
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-2xl p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Documents</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[460px]">
              Review, grade, and release student submissions across your classes.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-2xl px-3 py-4 pb-24 sm:px-5">
        <TeacherDocumentWorkPanel
          tableLabel="Documents"
          documents={data.documents}
          statusCounts={data.statusCounts}
          students={data.students}
          classes={data.classes}
          assignments={data.assignments}
          isDocumentSubmissionEnabled={data.isDocumentSubmissionEnabled}
          exitTo={exitTo}
          filters={filters}
          onFiltersChange={updateFilters}
          onClearFilters={() => {
            const next = new URLSearchParams();
            persistStudentWorkViewPreferences(next);
            setSearchParams(next, { replace: true });
          }}
          collapsedGroups={collapsedGroups}
          onCollapsedGroupsChange={(next, options) => {
            setCollapsedGroups(next);
            if (options?.persist === false) return;
            persistCollapsedStudentWorkGroups(next);
          }}
          testIds={{
            statusChips: 'student-work-status-chips',
            groupSelect: 'student-work-group-select',
          }}
          collapseAllGroupsWhenGroupChanges
          clickableRows
          compactRows
          sort={documentSort}
          onSortChange={handleDocumentSortChange}
        />
      </div>
    </section>
  );
}

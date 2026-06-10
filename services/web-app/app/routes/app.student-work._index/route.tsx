import { type LoaderFunctionArgs, redirect } from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatAssignmentGrade } from '~/domain/grading/gradeMath';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForScope } from '~/utils/feature-flags.server';
import {
  TEACHER_DOCUMENT_STATUSES,
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo';
import type { Prisma } from '@app/prisma';

export const handle = { breadcrumb: 'Student Work' };

type ClassSummary = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

type GroupMode = 'none' | 'class' | 'student' | 'assignment';

function formatClassLabel(klass: ClassSummary) {
  const base = `Grade ${klass.grade} • Period ${klass.period}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

function getDraftDisplayTitle(document: {
  title?: string | null;
  assignment?: { title?: string | null } | null;
}) {
  const documentTitle = document.title?.trim();
  if (documentTitle) return documentTitle;

  const assignmentTitle = document.assignment?.title?.trim();
  if (assignmentTitle) return assignmentTitle;

  return 'Untitled draft';
}

function resolveDocumentClass(document: {
  assignment?: {
    class: ClassSummary;
  } | null;
  profile: {
    studentProfile: {
      classes: ClassSummary[];
    } | null;
  };
}) {
  if (document.assignment?.class) {
    return document.assignment.class;
  }

  const studentClasses = document.profile.studentProfile?.classes ?? [];
  return studentClasses[0] ?? null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return redirect('/app');
  }

  const url = new URL(request.url);
  const studentId = url.searchParams.get('student') ?? '';
  const classId = url.searchParams.get('class') ?? '';
  const assignmentId = url.searchParams.get('assignment') ?? '';
  const statusParam = url.searchParams.get('status') ?? '';
  const status: TeacherDocumentStatus | '' =
    TEACHER_DOCUMENT_STATUSES.includes(statusParam as TeacherDocumentStatus)
      ? (statusParam as TeacherDocumentStatus)
      : '';
  const groupParam = url.searchParams.get('group') ?? '';
  const group: GroupMode = ['class', 'student', 'assignment'].includes(
    groupParam
  )
    ? (groupParam as GroupMode)
    : 'none';
  const query = (url.searchParams.get('q') ?? '').trim();

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: profile.teacherProfile.id } },
      isArchived: false,
    },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { id: true, name: true, organizationId: true } },
      students: {
        select: {
          profile: {
            select: {
              id: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      },
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const classIds = classes.map((klass) => klass.id);
  const students = Array.from(
    new Map(
      classes.flatMap((klass) =>
        klass.students.map((student) => [
          student.profile.id,
          {
            id: student.profile.id,
            name:
              student.profile.user.name?.trim() ||
              student.profile.user.email ||
              'Unknown student',
          },
        ])
      )
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const [assignments, isDocumentSubmissionEnabled] = await Promise.all([
    prisma.assignment.findMany({
      where: { classId: { in: classIds } },
      select: { id: true, title: true, classId: true },
      orderBy: [{ title: 'asc' }],
    }),
    isDocumentSubmissionEnabledForScope({
      schoolIds: classes.map((klass) => klass.school.id),
      organizationIds: [profile.organization.id],
      teacherProfileIds: [profile.teacherProfile.id],
      classIds,
    }),
  ]);

  const documentWhere: Prisma.DocumentWhereInput = {
    deletedAt: null,
    OR: [
      { assignment: { classId: { in: classIds } } },
      {
        assignmentId: null,
        studentProfile: { classes: { some: { id: { in: classIds } } } },
      },
    ],
  };

  const andClauses: Prisma.DocumentWhereInput[] = [];

  if (studentId) {
    documentWhere.profileId = studentId;
  }

  if (classId) {
    andClauses.push({
      OR: [
        { assignment: { classId } },
        {
          assignmentId: null,
          studentProfile: { classes: { some: { id: classId } } },
        },
      ],
    });
  }

  if (assignmentId) {
    documentWhere.assignmentId = assignmentId;
  }

  if (query) {
    andClauses.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { assignment: { title: { contains: query, mode: 'insensitive' } } },
        {
          profile: {
            user: {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            },
          },
        },
        {
          submissions: {
            some: { title: { contains: query, mode: 'insensitive' } },
          },
        },
      ],
    });
  }

  if (andClauses.length > 0) {
    documentWhere.AND = andClauses;
  }

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
      profile: {
        select: {
          id: true,
          user: { select: { name: true, email: true } },
          studentProfile: {
            select: {
              classes: {
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
        },
      },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
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
        },
      },
      _count: { select: { submissions: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 250,
  });

  const statusCounts: Record<TeacherDocumentStatus, number> = {
    'in-progress': 0,
    'needs-grading': 0,
    graded: 0,
    released: 0,
  };
  for (const document of allDocuments) {
    statusCounts[getTeacherDocumentStatus(document.submissions[0])] += 1;
  }

  const documents = status
    ? allDocuments.filter(
        (document) =>
          getTeacherDocumentStatus(document.submissions[0]) === status
      )
    : allDocuments;

  return {
    documents,
    statusCounts,
    classes,
    students,
    assignments,
    isDocumentSubmissionEnabled,
    filters: {
      studentId,
      classId,
      assignmentId,
      status,
      group,
      query,
    },
  };
}

type DocumentRow = {
  id: string;
  title: string | null;
  updatedAt: Date | string;
  assignment: {
    id: string;
    title: string | null;
    submitForGrade: boolean;
    pointValue: number | null;
    class: ClassSummary;
  } | null;
  profile: {
    id: string;
    user: { name: string | null; email: string };
    studentProfile: { classes: ClassSummary[] } | null;
  };
  submissions: Array<{
    id: string;
    title: string | null;
    score: string | null;
    feedback: string | null;
    rubricScores: unknown | null;
    overallComment: string | null;
    numericPercentage: number | null;
    letterGrade: string | null;
    gradedAt: Date | string | null;
    releasedAt: Date | string | null;
  }>;
  _count: { submissions: number };
};

export default function StudentWorkRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [searchValue, setSearchValue] = useState(data.filters.query);
  const exitTo = `/app/student-work${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const encodedExitTo = encodeURIComponent(exitTo);

  const updateFilter = (
    key: 'student' | 'class' | 'assignment' | 'status' | 'group' | 'q',
    value: string
  ) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || value === 'none') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  const visibleAssignments = data.filters.classId
    ? data.assignments.filter(
        (assignment) => assignment.classId === data.filters.classId
      )
    : data.assignments;

  const documents = data.documents as DocumentRow[];

  const getRowStatus = (document: DocumentRow) =>
    getTeacherDocumentStatus(document.submissions[0]);

  const getRowStatusLabel = (document: DocumentRow) => {
    const status = getRowStatus(document);
    if (status !== 'graded' && status !== 'released') {
      return TEACHER_DOCUMENT_STATUS_LABELS[status];
    }
    const submission = document.submissions[0];
    const grade = submission
      ? formatAssignmentGrade({
          submitForGrade: document.assignment?.submitForGrade,
          numericPercentage: submission.numericPercentage ?? null,
          letterGrade: submission.letterGrade ?? null,
          pointValue: document.assignment?.pointValue ?? null,
        })
      : null;
    return grade
      ? `${TEACHER_DOCUMENT_STATUS_LABELS[status]} · ${grade}`
      : TEACHER_DOCUMENT_STATUS_LABELS[status];
  };

  const groups = useMemo(() => {
    if (data.filters.group === 'none') {
      return [{ key: 'all', label: '', documents }];
    }

    const byKey = new Map<
      string,
      { key: string; label: string; documents: DocumentRow[] }
    >();
    for (const document of documents) {
      let key = '';
      let label = '';
      if (data.filters.group === 'class') {
        const klass = resolveDocumentClass(document);
        key = klass?.id ?? 'no-class';
        label = klass ? formatClassLabel(klass) : 'No class';
      } else if (data.filters.group === 'student') {
        key = document.profile.id;
        label = document.profile.user.name || document.profile.user.email;
      } else {
        key = document.assignment?.id ?? 'no-assignment';
        label = document.assignment?.title || 'No assignment';
      }

      const existing = byKey.get(key);
      if (existing) {
        existing.documents.push(document);
      } else {
        byKey.set(key, { key, label, documents: [document] });
      }
    }

    return Array.from(byKey.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [data.filters.group, documents]);

  const statusChips: Array<{ status: TeacherDocumentStatus; count: number }> =
    TEACHER_DOCUMENT_STATUSES.map((status) => ({
      status,
      count: data.statusCounts[status],
    }));

  const renderRows = (rows: DocumentRow[]) =>
    rows.map((document) => {
      const latestSubmission = document.submissions[0];
      const klass = resolveDocumentClass(document);
      const status = getRowStatus(document);
      const openTo = latestSubmission
        ? `/app/submissions/${latestSubmission.id}?${
            data.isDocumentSubmissionEnabled ? 'edit=1&' : ''
          }exitTo=${encodedExitTo}`
        : `/app/documents/${document.id}?left=tutor&exitTo=${encodedExitTo}`;

      return (
        <TableRow key={document.id}>
          <TableCell className="pl-4 font-medium">
            {document.profile.user.name || document.profile.user.email}
          </TableCell>
          <TableCell>
            {latestSubmission?.title?.trim() || getDraftDisplayTitle(document)}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {klass ? formatClassLabel(klass) : '—'}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {document.assignment?.title || '—'}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className={cn(
                  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES[status],
                  'shrink-0 whitespace-nowrap'
                )}
              >
                {getRowStatusLabel(document)}
              </Badge>
              {document._count.submissions >= 2 ? (
                <span className="text-xs text-muted-foreground">
                  v{document._count.submissions}
                </span>
              ) : null}
            </div>
          </TableCell>
          <TableCell className="text-muted-foreground">
            {timeAgo(new Date(document.updatedAt))}
          </TableCell>
          <TableCell className="pr-4">
            <Button asChild size="sm" variant="outline">
              <Link to={openTo}>Open</Link>
            </Button>
          </TableCell>
        </TableRow>
      );
    });

  const renderTable = (rows: DocumentRow[], nested = false) => (
    <Table
      aria-label="Student work"
      containerClassName={nested ? 'rounded-none border-0 shadow-none' : undefined}
      className={nested ? undefined : 'rounded-lg bg-muted'}
    >
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Student</TableHead>
          <TableHead>Document</TableHead>
          <TableHead>Class</TableHead>
          <TableHead>Assignment</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Updated</TableHead>
          <TableHead className="pr-4">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{renderRows(rows)}</TableBody>
    </Table>
  );

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Student Work</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[520px]">
              All student documents across your classes. Filter, group, grade,
              and release.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-3 py-4 pb-24 sm:px-5">
        <div
          data-testid="student-work-status-chips"
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            onClick={() => updateFilter('status', 'all')}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              !data.filters.status
                ? 'border-foreground bg-foreground text-background'
                : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            All (
            {Object.values(data.statusCounts).reduce(
              (total, count) => total + count,
              0
            )}
            )
          </button>
          {statusChips.map(({ status, count }) => (
            <button
              key={status}
              type="button"
              onClick={() => updateFilter('status', status)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                data.filters.status === status
                  ? 'border-foreground bg-foreground text-background'
                  : cn(
                      'bg-background hover:text-foreground',
                      status === 'released' && count > 0
                        ? 'text-green-700'
                        : status === 'needs-grading' && count > 0
                          ? 'text-orange-700'
                          : 'text-muted-foreground'
                    )
              )}
            >
              {TEACHER_DOCUMENT_STATUS_LABELS[status]} ({count})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter('q', searchValue.trim());
            }}
            className="relative"
          >
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search students, documents..."
              className="w-[240px] bg-background pl-8"
              aria-label="Search student work"
            />
          </form>

          <Select
            value={data.filters.studentId || 'all'}
            onValueChange={(value) => updateFilter('student', value)}
          >
            <SelectTrigger className="w-[200px] bg-background">
              <SelectValue placeholder="All students" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              {data.students.map((student) => (
                <SelectItem key={student.id} value={student.id}>
                  {student.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={data.filters.classId || 'all'}
            onValueChange={(value) => {
              const next = new URLSearchParams(searchParams);
              if (!value || value === 'all') {
                next.delete('class');
              } else {
                next.set('class', value);
              }
              if (value !== 'all' && data.filters.assignmentId) {
                const assignmentStillVisible = data.assignments.some(
                  (assignment) =>
                    assignment.id === data.filters.assignmentId &&
                    assignment.classId === value
                );
                if (!assignmentStillVisible) {
                  next.delete('assignment');
                }
              }
              setSearchParams(next, { replace: true });
            }}
          >
            <SelectTrigger className="w-[220px] bg-background">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {data.classes.map((klass) => (
                <SelectItem key={klass.id} value={klass.id}>
                  {formatClassLabel(klass)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={data.filters.assignmentId || 'all'}
            onValueChange={(value) => updateFilter('assignment', value)}
          >
            <SelectTrigger className="w-[220px] bg-background">
              <SelectValue placeholder="All assignments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignments</SelectItem>
              {visibleAssignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {assignment.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={data.filters.group === 'none' ? 'none' : data.filters.group}
            onValueChange={(value) => updateFilter('group', value)}
          >
            <SelectTrigger
              className="w-[200px] bg-background"
              data-testid="student-work-group-select"
            >
              <SelectValue placeholder="No grouping" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="class">Group by class</SelectItem>
              <SelectItem value="student">Group by student</SelectItem>
              <SelectItem value="assignment">Group by assignment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12">
            <span className="text-lg font-bold">No documents found</span>
            <span className="text-sm text-muted-foreground">
              Try clearing a filter or check another class.
            </span>
          </div>
        ) : data.filters.group === 'none' ? (
          <div className="relative min-h-[200px] flex-1 overflow-y-auto">
            {renderTable(documents)}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => {
              const isOpen = !collapsedGroups.has(group.key);

              return (
                <Collapsible
                  key={group.key}
                  open={isOpen}
                  onOpenChange={(open) => {
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (open) {
                        next.delete(group.key);
                      } else {
                        next.add(group.key);
                      }
                      return next;
                    });
                  }}
                  className="overflow-hidden rounded-lg border bg-background shadow-sm"
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 bg-muted/70 px-4 py-3 text-left transition-colors hover:bg-muted"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="text-base font-semibold text-foreground">
                        {group.label}
                      </span>
                      <Badge variant="secondary" className="ml-1">
                        {group.documents.length}
                      </Badge>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t bg-muted/50">
                      {renderTable(group.documents, true)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

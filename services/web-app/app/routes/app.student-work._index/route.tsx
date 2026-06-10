import { type LoaderFunctionArgs, redirect } from 'react-router';
import { Link, useLoaderData, useSearchParams } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
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
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { timeAgo } from '~/utils/timeAgo';
import type { Prisma } from '@app/prisma';

export const handle = { breadcrumb: 'Student Work' };

type ClassSummary = {
  id: string;
  grade: string;
  period: string;
  title: string | null;
};

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

function getDocumentStatus(document: {
  submissions: Array<{
    gradedAt: Date | null;
    releasedAt: Date | null;
  }>;
}) {
  const submission = document.submissions[0];
  if (!submission) return 'In Progress';
  if (submission.releasedAt) return 'Released';
  if (submission.gradedAt) return 'Graded';
  return 'Needs Grading';
}

function statusVariant(
  status: string
): 'secondary' | 'success' | 'info-outlined' | 'outline' {
  switch (status) {
    case 'Needs Grading':
      return 'info-outlined';
    case 'Graded':
      return 'outline';
    case 'Released':
      return 'success';
    default:
      return 'secondary';
  }
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
  if (studentClasses.length === 1) {
    return studentClasses[0];
  }

  if (studentClasses.length > 1) {
    return studentClasses[0];
  }

  return null;
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
      school: { select: { name: true } },
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

  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: classIds } },
    select: { id: true, title: true, classId: true },
    orderBy: [{ title: 'asc' }],
  });

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

  if (studentId) {
    documentWhere.profileId = studentId;
  }

  if (classId) {
    documentWhere.AND = [
      {
        OR: [
          { assignment: { classId } },
          {
            assignmentId: null,
            studentProfile: { classes: { some: { id: classId } } },
          },
        ],
      },
    ];
  }

  if (assignmentId) {
    documentWhere.assignmentId = assignmentId;
  }

  const documents = await prisma.document.findMany({
    where: documentWhere,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      assignment: {
        select: {
          id: true,
          title: true,
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
          gradedAt: true,
          releasedAt: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 250,
  });

  return {
    documents,
    classes,
    students,
    assignments,
    filters: {
      studentId,
      classId,
      assignmentId,
    },
  };
}

export default function StudentWorkRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const exitTo = `/app/student-work${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const encodedExitTo = encodeURIComponent(exitTo);

  const updateFilter = (key: 'student' | 'class' | 'assignment', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all') {
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

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Student Work</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[520px]">
              All student documents across your classes. Filter by student, class,
              or assignment.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-3 py-4 pb-24 sm:px-5">
        <div className="flex flex-wrap gap-3">
          <Select
            value={data.filters.studentId || 'all'}
            onValueChange={(value) => updateFilter('student', value)}
          >
            <SelectTrigger className="w-[220px] bg-background">
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
            <SelectTrigger className="w-[260px] bg-background">
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
            <SelectTrigger className="w-[260px] bg-background">
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
        </div>

        {data.documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12">
            <span className="text-lg font-bold">No documents found</span>
            <span className="text-sm text-muted-foreground">
              Try clearing a filter or check another class.
            </span>
          </div>
        ) : (
          <div className="relative min-h-[200px] flex-1 overflow-y-auto">
            <Table className="rounded-lg bg-muted">
              <TableHeader className="rounded-t-lg">
                <TableRow className="rounded-t-lg bg-muted/50">
                  <TableHead className="rounded-tl-lg pl-4">Student</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="rounded-tr-lg pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.documents.map((document) => {
                  const status = getDocumentStatus(document);
                  const klass = resolveDocumentClass(document);
                  const latestSubmission = document.submissions[0];
                  const openTo = latestSubmission
                    ? `/app/submissions/${latestSubmission.id}?edit=0&exitTo=${encodedExitTo}`
                    : `/app/documents/${document.id}?left=tutor&exitTo=${encodedExitTo}`;

                  return (
                    <TableRow key={document.id}>
                      <TableCell className="pl-4 font-medium">
                        {document.profile.user.name ||
                          document.profile.user.email}
                      </TableCell>
                      <TableCell>{getDraftDisplayTitle(document)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {klass ? formatClassLabel(klass) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {document.assignment?.title || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(status)}>{status}</Badge>
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
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </section>
  );
}

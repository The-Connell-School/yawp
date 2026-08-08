import { type LoaderFunctionArgs, redirect } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { formatClassLabel } from '~/utils/teacher-document-work-utils';

export const handle = { breadcrumb: 'My Assignments' };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }

  const classAssignments = await prisma.classAssignment.findMany({
    where: {
      class: {
        teachers: { some: { id: profile.id } },
        isArchived: false,
      },
    },
    select: {
      id: true,
      class: {
        select: { id: true, grade: true, period: true, title: true },
      },
      assignment: {
        select: {
          id: true,
          title: true,
          assignmentType: { select: { title: true } },
          _count: { select: { documents: true } },
        },
      },
    },
    orderBy: [{ assignment: { createdAt: 'desc' } }],
  });

  const assignments = classAssignments.map((classAssignment) => ({
    classAssignmentId: classAssignment.id,
    assignmentId: classAssignment.assignment.id,
    title: classAssignment.assignment.title?.trim() || 'Untitled Assignment',
    assignmentTypeTitle: classAssignment.assignment.assignmentType.title,
    documentCount: classAssignment.assignment._count.documents,
    classId: classAssignment.class.id,
    classLabel: formatClassLabel(classAssignment.class),
  }));

  return { assignments };
}

export default function MyAssignmentsRoute() {
  const { assignments } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState('');

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );

  const sortedAssignments = useMemo(
    () =>
      [...assignments].sort((a, b) => collator.compare(a.title, b.title)),
    [assignments, collator]
  );

  const filteredAssignments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sortedAssignments;
    return sortedAssignments.filter(
      (assignment) =>
        assignment.title.toLowerCase().includes(query) ||
        assignment.classLabel.toLowerCase().includes(query) ||
        assignment.assignmentTypeTitle.toLowerCase().includes(query)
    );
  }, [sortedAssignments, searchQuery]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">My Assignments</h1>
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="my-assignments-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search assignments"
          className="h-9 rounded-md border-0 bg-background pl-9 shadow-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Search assignments"
          data-testid="my-assignments-search"
        />
      </div>

      {assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-12 text-center">
          <span className="text-lg font-bold">No assignments yet</span>
          <span className="text-base/7 text-muted-foreground sm:text-sm/6">
            Assignments you create for your classes will show up here.
          </span>
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-12 text-center">
          <span className="text-lg font-bold">No assignments found</span>
          <span className="text-base/7 text-muted-foreground sm:text-sm/6">
            Try a different search term
          </span>
        </div>
      ) : (
        <div className="rounded-lg bg-muted/50">
          <Table aria-label="My Assignments">
            <TableHeader className="rounded-t-lg">
              <TableRow className="rounded-t-lg bg-muted/50">
                <TableHead className="rounded-tl-lg pl-4">
                  Assignment
                </TableHead>
                <TableHead className="whitespace-nowrap">Class</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap rounded-tr-lg pr-4">
                  Documents
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.map((assignment) => (
                <TableRow key={assignment.classAssignmentId}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to={`/app/my-classes/${assignment.classId}?tab=assignments`}
                      className="[overflow-wrap:anywhere] hover:underline"
                      data-testid={`my-assignment-open-${assignment.classAssignmentId}`}
                    >
                      {assignment.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.classLabel}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {assignment.assignmentTypeTitle}
                  </TableCell>
                  <TableCell className="pr-4 text-muted-foreground">
                    {assignment.documentCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

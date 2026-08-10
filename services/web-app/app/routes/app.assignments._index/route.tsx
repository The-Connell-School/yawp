import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useFetcher, useLoaderData } from 'react-router';
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
// The flag is read by the component, so it has to come from the client-safe module.
// Importing it through saved-assignments.server (which merely re-exports it) makes the
// component depend on server-only code, and React Router can only strip server code from
// loader/action/middleware/headers — the route's client module then fails to build, and
// clicking the sidebar link does nothing at all.
import {
  SAVED_ASSIGNMENTS_ENABLED,
  type SavedAssignment,
} from '~/domain/assignments/saved-assignments';
import {
  archiveSavedAssignment,
  listSavedAssignments,
} from '~/domain/assignments/saved-assignments.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
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

  // Everything the page needs to reuse a saved assignment: the saved rows plus
  // the classes and assignment types the creation sheet offers.
  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: profile.id } }, isArchived: false },
    select: {
      id: true,
      grade: true,
      period: true,
      title: true,
      school: { select: { id: true, organizationId: true } },
    },
  });

  const availableAssignmentTypes =
    teacherClasses.length > 0
      ? await getAvailableAssignmentTypesForScopes<{
          id: string;
          title: string;
          systemKey: string | null;
        }>({
          scopes: teacherClasses.map((klass) => ({
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
            teacherProfileId: profile.id,
          })),
          select: { id: true, title: true, systemKey: true },
          orderBy: { position: 'asc' },
        })
      : [];

  const savedAssignments = SAVED_ASSIGNMENTS_ENABLED
    ? await listSavedAssignments({ membershipId: profile.id })
    : [];

  return {
    assignments,
    savedAssignments,
    assignmentCreationClasses: teacherClasses.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),
    // AP History assignments are built from their own library rather than a
    // free-text prompt, so they are not offered here.
    assignmentCreationTypes: availableAssignmentTypes
      .filter((type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY)
      .map((type) => ({ id: type.id, title: type.title })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return dataResponse(
      { success: false, message: 'Only teachers can do that.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();

  if (intent !== 'remove-saved-assignment') {
    return dataResponse(
      { success: false, message: 'Unsupported action.' },
      { status: 400 }
    );
  }

  const savedAssignmentId = formData.get('savedAssignmentId')?.toString() ?? '';
  if (!savedAssignmentId) {
    return dataResponse(
      { success: false, message: 'Saved assignment is required.' },
      { status: 400 }
    );
  }

  // Scoped by membership inside the domain call, so an id from someone else's
  // list simply removes nothing.
  const removed = await archiveSavedAssignment({
    membershipId: profile.id,
    savedAssignmentId,
  });

  if (!removed) {
    return dataResponse(
      { success: false, message: 'That saved assignment is no longer there.' },
      { status: 404 }
    );
  }

  return dataResponse({ success: true });
}

function SavedAssignmentsPanel({
  savedAssignments,
  onReuse,
}: {
  savedAssignments: SavedAssignment[];
  onReuse: (savedAssignment: SavedAssignment) => void;
}) {
  const removeFetcher = useFetcher<{ success?: boolean; message?: string }>();
  const removingId =
    removeFetcher.state !== 'idle'
      ? removeFetcher.formData?.get('savedAssignmentId')?.toString()
      : undefined;

  return (
    <section className="mb-8" aria-labelledby="saved-assignments-heading">
      <h2
        id="saved-assignments-heading"
        className="mb-2 text-lg font-semibold"
      >
        My Saved Assignments
      </h2>
      <p className="mb-4 text-base/7 text-muted-foreground sm:text-sm/6">
        Assignments you kept for reuse. Giving one to a class opens it
        pre-filled — nothing here has been assigned yet.
      </p>

      {savedAssignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-8 text-center">
          <span className="text-base/7 text-muted-foreground sm:text-sm/6">
            Tick &quot;Save to My Saved Assignments&quot; when you create an
            assignment and it will show up here.
          </span>
        </div>
      ) : (
        <ul className="divide-y rounded-lg bg-muted/50" data-testid="saved-assignments-list">
          {savedAssignments.map((savedAssignment) => (
            <li
              key={savedAssignment.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
              data-testid={`saved-assignment-${savedAssignment.id}`}
            >
              <div className="min-w-0">
                <p className="font-medium [overflow-wrap:anywhere]">
                  {savedAssignment.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {savedAssignment.assignmentTypeTitle}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onReuse(savedAssignment)}
                  data-testid={`saved-assignment-use-${savedAssignment.id}`}
                >
                  Give to a class
                </Button>
                <removeFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="remove-saved-assignment"
                  />
                  <input
                    type="hidden"
                    name="savedAssignmentId"
                    value={savedAssignment.id}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    disabled={removingId === savedAssignment.id}
                    data-testid={`saved-assignment-remove-${savedAssignment.id}`}
                  >
                    Remove
                  </Button>
                </removeFetcher.Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {removeFetcher.data && removeFetcher.data.success === false ? (
        <p className="mt-2 text-sm text-destructive">
          {removeFetcher.data.message}
        </p>
      ) : null}
    </section>
  );
}

export default function MyAssignmentsRoute() {
  const {
    assignments,
    savedAssignments,
    assignmentCreationClasses,
    assignmentCreationTypes,
  } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState('');
  const [reusedAssignment, setReusedAssignment] =
    useState<SavedAssignment | null>(null);

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

      {SAVED_ASSIGNMENTS_ENABLED ? (
        <SavedAssignmentsPanel
          savedAssignments={savedAssignments}
          onReuse={setReusedAssignment}
        />
      ) : null}

      {reusedAssignment ? (
        <AssignmentCreationSheet
          // Remounting per saved assignment is what re-seeds the sheet's own
          // state with that assignment's settings.
          key={reusedAssignment.id}
          open
          onOpenChange={(open) => {
            if (!open) setReusedAssignment(null);
          }}
          entryPoint="dashboard"
          assignmentTypes={assignmentCreationTypes}
          teacherClasses={assignmentCreationClasses}
          initialAssignmentTypeId={reusedAssignment.assignmentTypeId}
          initialTitle={reusedAssignment.title}
          initialPrompt={reusedAssignment.prompt}
          initialSubmitForGrade={reusedAssignment.submitForGrade}
          initialPointValue={reusedAssignment.pointValue}
          initialTutorEnabled={reusedAssignment.tutorEnabled}
          initialGradingAssistantStrictnessLevel={
            reusedAssignment.gradingAssistantStrictnessLevel
          }
        />
      ) : null}

      <h2 className="mb-2 text-lg font-semibold">Assigned</h2>
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
                      to={`/app/my-classes/${assignment.classId}/assignment/${assignment.assignmentId}`}
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

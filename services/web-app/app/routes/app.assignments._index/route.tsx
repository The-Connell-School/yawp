import { isDailyPagesWritingConditionsEnabled } from '~/domain/feature-flags/feature-flags.server';
import { getCreationTypeDefaultsById } from '~/domain/grading/writing-time.server';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useFetcher, useLoaderData } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Search, Trash2 } from 'lucide-react';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import { TutorOffBadge } from '~/components/assignments/tutor-off-badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import { Tooltip } from '~/components/ui/tooltip';
import { Pagination } from '~/components/table/pagination';
import { useTable } from '~/hooks/useTable';
import { clampAssignmentPaginationSkip } from '../app.my-classes.$classId/class-assignments-tab';
import { AssignmentClasses } from './assignment-classes';
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
import {
  AssignmentHasCollaborativeWorkError,
  deleteClassAssignmentDeployment,
} from '~/utils/assignment-deployment.server';
import { loadAssignmentCreationQuotasForTypes } from '~/utils/assignment-quota.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { prisma } from '~/utils/db.server';
import {
  resolveTeacherSchoolYearScope,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import { formatClassLabel } from '~/utils/teacher-document-work-utils';
import { getGrammarGradingAssignmentTypeIds } from '~/domain/assignment-types/assignment-type-grading-config.server';

export const handle = { breadcrumb: 'My Assignments' };

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    return redirect('/app');
  }

  const schoolYearScope = await resolveTeacherSchoolYearScope(
    request,
    profile.id
  );

  const classAssignments = await prisma.classAssignment.findMany({
    where: {
      class: {
        teachers: { some: { id: profile.id } },
        isArchived: false,
        ...schoolYearWhere(schoolYearScope),
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
          // Drives the "Tutor off" marker: an assignment written without the
          // tutor is a cold write, and a teacher scanning this list needs to
          // see which rows those are.
          tutorEnabled: true,
          assignmentType: { select: { title: true } },
        },
      },
      // Counted per deployment, not per assignment: the assignment-level count
      // is the cross-class total, which is the wrong number for a single class
      // and gets summed below for the row that spans several.
      _count: { select: { documents: true } },
    },
    orderBy: [{ assignment: { createdAt: 'desc' } }],
  });

  // An Assignment is one assignment however many classes it is deployed to, so
  // the list collapses its ClassAssignment rows into one entry that names them.
  const assignmentsById = new Map<
    string,
    {
      assignmentId: string;
      title: string;
      assignmentTypeTitle: string;
      tutorEnabled: boolean;
      documentCount: number;
      classes: { id: string; label: string }[];
    }
  >();

  for (const classAssignment of classAssignments) {
    const existing = assignmentsById.get(classAssignment.assignment.id);
    const entry = existing ?? {
      assignmentId: classAssignment.assignment.id,
      title: classAssignment.assignment.title?.trim() || 'Untitled Assignment',
      assignmentTypeTitle: classAssignment.assignment.assignmentType.title,
      // A property of the Assignment, so it is the same across every class the
      // assignment was deployed to; collapsing rows cannot disagree about it.
      tutorEnabled: classAssignment.assignment.tutorEnabled,
      documentCount: 0,
      classes: [],
    };
    entry.documentCount += classAssignment._count.documents;
    entry.classes.push({
      id: classAssignment.class.id,
      label: formatClassLabel(classAssignment.class),
    });
    if (!existing) assignmentsById.set(entry.assignmentId, entry);
  }

  const assignments = [...assignmentsById.values()].map((entry) => ({
    ...entry,
    // Search index rather than display text: the table renders one chip per
    // class, but searching a class the chips collapsed still finds the row.
    classLabel: entry.classes.map((klass) => klass.label).join(', '),
    // The detail page is class-scoped. Hand it the class when there is only
    // one; with several it falls back to the first deployment and shows its
    // own class picker, so pinning one here would be a guess.
    href:
      entry.classes.length === 1
        ? `/app/assignments/${entry.assignmentId}?classId=${entry.classes[0].id}`
        : `/app/assignments/${entry.assignmentId}`,
  }));

  // Everything the page needs to reuse a saved assignment: the saved rows plus
  // the classes and assignment types the creation sheet offers.
  const teacherClasses = await prisma.class.findMany({
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
      school: { select: { id: true, organizationId: true } },
    },
  });

  const availableAssignmentTypes =
    teacherClasses.length > 0
      ? await getAvailableAssignmentTypesForScopes<{
          id: string;
          title: string;
          kind: string | null;
          systemKey: string | null;
          collaborationSupported: boolean;
        }>({
          scopes: teacherClasses.map((klass) => ({
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
            teacherProfileId: profile.id,
          })),
          select: {
            id: true,
            title: true,
            kind: true,
            systemKey: true,
            collaborationSupported: true,
          },
          orderBy: { position: 'asc' },
        })
      : [];

  const savedAssignments = SAVED_ASSIGNMENTS_ENABLED
    ? await listSavedAssignments({ membershipId: profile.id })
    : [];

  // AP History assignments are built from their own library rather than a
  // free-text prompt, so they are not offered here.
  const creationTypeRows = availableAssignmentTypes.filter(
    (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );
  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    creationTypeRows.map((type) => type.id)
  );
  // Paragraph type and writing time are behind a global flag (off by
  // default); off, the form offers neither.
  const writingConditionsEnabled =
    await isDailyPagesWritingConditionsEnabled();
  const creationTypeDefaults = await getCreationTypeDefaultsById(
    creationTypeRows.map((type) => type.id),
    { writingConditionsEnabled }
  );

  return {
    assignments,
    savedAssignments,
    writingConditionsEnabled,
    assignmentCreationClasses: teacherClasses.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),

    assignmentCreationTypes: await (async () => {
      const quotaByTypeId = await loadAssignmentCreationQuotasForTypes(
        profile.organization,
        creationTypeRows.map((type) => ({
          id: type.id,
          kind: type.kind ?? null,
        }))
      );
      return creationTypeRows.map((type) => ({
        id: type.id,
        title: type.title,
        collaborationSupported: type.collaborationSupported,
        gradesGrammar: gradesGrammarIds.has(type.id),
        defaultWritingTimeMinutes:
          creationTypeDefaults.get(type.id)?.defaultWritingTimeMinutes ?? null,
        offersParagraphModes:
          creationTypeDefaults.get(type.id)?.offersParagraphModes ?? false,
        ...quotaByTypeId.get(type.id),
      }));
    })(),
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

  if (intent === 'delete-assignments') {
    const assignmentIds = [
      ...new Set(formData.getAll('assignmentIds').map(String)),
    ];

    if (!assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Select at least one assignment.' },
        { status: 400 }
      );
    }

    // Only the deployments in this teacher's own classes: an assignment shared
    // with a class someone else teaches must not disappear from under them.
    // The assignment row itself is removed once its last deployment goes.
    const deployments = await prisma.classAssignment.findMany({
      where: {
        assignmentId: { in: assignmentIds },
        class: { teachers: { some: { id: profile.id } }, isArchived: false },
      },
      select: { assignmentId: true, classId: true },
    });

    const reachable = new Set(
      deployments.map((deployment) => deployment.assignmentId)
    );
    if (reachable.size !== assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Some assignments were not found.' },
        { status: 404 }
      );
    }

    const protectedDeployment = await prisma.documentGroup.findFirst({
      where: {
        documentId: { not: null },
        classAssignment: {
          assignmentId: { in: assignmentIds },
          class: { teachers: { some: { id: profile.id } }, isArchived: false },
        },
      },
      select: { id: true },
    });
    if (protectedDeployment) {
      return dataResponse(
        {
          success: false,
          message: 'Assignments with shared group work cannot be deleted.',
        },
        { status: 409 }
      );
    }

    try {
      for (const deployment of deployments) {
        await deleteClassAssignmentDeployment({
          assignmentId: deployment.assignmentId,
          classId: deployment.classId,
        });
      }
    } catch (error) {
      if (error instanceof AssignmentHasCollaborativeWorkError) {
        return dataResponse(
          { success: false, message: error.message },
          { status: 409 }
        );
      }
      throw error;
    }

    return dataResponse({
      success: true,
      message:
        assignmentIds.length === 1
          ? 'Assignment deleted.'
          : `Deleted ${assignmentIds.length} assignments.`,
    });
  }

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
      <h2 id="saved-assignments-heading" className="mb-2 text-lg font-semibold">
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
        <ul
          className="divide-y rounded-lg bg-muted/50"
          data-testid="saved-assignments-list"
        >
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
    writingConditionsEnabled,
  } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [reusedAssignment, setReusedAssignment] =
    useState<SavedAssignment | null>(null);

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );

  const sortedAssignments = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...assignments].sort(
      (a, b) => collator.compare(a.title, b.title) * direction
    );
  }, [assignments, collator, sortDirection]);

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

  const paginatedAssignments = filteredAssignments.slice(
    pagination.skip,
    pagination.skip + pagination.take
  );

  const {
    selected: selectedAssignmentIds,
    setSelected: setSelectedAssignmentIds,
    handleSelectAll,
    handleSelect,
  } = useTable({
    rows: useMemo(
      () =>
        filteredAssignments.map(({ assignmentId }) => ({ id: assignmentId })),
      [filteredAssignments]
    ),
  });

  useEffect(() => {
    setPagination((current) => ({ ...current, skip: 0 }));
  }, [searchQuery, sortDirection]);

  useEffect(() => {
    setPagination((current) => {
      const skip = clampAssignmentPaginationSkip(
        current.skip,
        current.take,
        filteredAssignments.length
      );
      return skip === current.skip ? current : { ...current, skip };
    });
  }, [filteredAssignments.length]);

  // A row that search or a delete took away must not stay selected, or the
  // bulk bar acts on assignments the teacher can no longer see.
  useEffect(() => {
    const visibleIds = new Set(
      filteredAssignments.map(({ assignmentId }) => assignmentId)
    );
    setSelectedAssignmentIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredAssignments, setSelectedAssignmentIds]);

  const hasSelection = selectedAssignmentIds.length > 0;

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
          writingConditionsEnabled={writingConditionsEnabled}
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 w-full max-w-sm flex-1">
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
        <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          {hasSelection ? (
            <Form
              method="post"
              className="inline"
              onSubmit={(event) => {
                const count = selectedAssignmentIds.length;
                if (
                  !window.confirm(
                    count === 1
                      ? 'Delete this assignment from your classes? Solo student documents will remain. Assignments with shared group work cannot be deleted.'
                      : `Delete ${count} assignments from your classes? Solo student documents will remain. Assignments with shared group work cannot be deleted.`
                  )
                ) {
                  event.preventDefault();
                  return;
                }
                setSelectedAssignmentIds([]);
              }}
            >
              <input type="hidden" name="intent" value="delete-assignments" />
              {selectedAssignmentIds.map((id) => (
                <input key={id} type="hidden" name="assignmentIds" value={id} />
              ))}
              <Tooltip
                text={`Delete ${selectedAssignmentIds.length} assignment(s)`}
              >
                <Button
                  type="submit"
                  size="icon-sm"
                  variant="outline"
                  aria-label={`Delete ${selectedAssignmentIds.length} assignment(s)`}
                  data-testid="my-assignments-delete-selected"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            </Form>
          ) : null}
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            data-testid="my-assignments-new-assignment"
            onClick={() => setIsCreateSheetOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Assignment
          </Button>
        </div>
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
                <TableHead className="w-[50px] rounded-tl-lg pl-4">
                  <Checkbox
                    aria-label="Select all assignments"
                    checked={
                      filteredAssignments.length > 0 &&
                      selectedAssignmentIds.length ===
                        filteredAssignments.length
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 gap-2 px-2"
                    aria-label={`Sort assignments by title ${
                      sortDirection === 'asc' ? 'descending' : 'ascending'
                    }`}
                    onClick={() =>
                      setSortDirection((current) =>
                        current === 'asc' ? 'desc' : 'asc'
                      )
                    }
                  >
                    Assignment
                    {sortDirection === 'asc' ? (
                      <ArrowUp className="h-4 w-4" />
                    ) : (
                      <ArrowDown className="h-4 w-4" />
                    )}
                  </Button>
                </TableHead>
                <TableHead className="whitespace-nowrap">Classes</TableHead>
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap rounded-tr-lg pr-4">
                  Documents
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedAssignments.map((assignment) => (
                <TableRow
                  key={assignment.assignmentId}
                  data-state={
                    selectedAssignmentIds.includes(assignment.assignmentId)
                      ? 'selected'
                      : undefined
                  }
                >
                  <TableCell className="max-h-[37px] pl-4">
                    <Checkbox
                      aria-label={`Select assignment ${assignment.title}`}
                      checked={selectedAssignmentIds.includes(
                        assignment.assignmentId
                      )}
                      onCheckedChange={() =>
                        handleSelect(assignment.assignmentId)
                      }
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={assignment.href}
                        className="[overflow-wrap:anywhere] hover:underline"
                        data-testid={`my-assignment-open-${assignment.assignmentId}`}
                      >
                        {assignment.title}
                      </Link>
                      <TutorOffBadge tutorEnabled={assignment.tutorEnabled} />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <AssignmentClasses classes={assignment.classes} />
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

      {filteredAssignments.length > 0 ? (
        <Pagination
          totalCount={filteredAssignments.length}
          skip={pagination.skip}
          take={pagination.take}
          onChange={(skip, take) => setPagination({ skip, take })}
        />
      ) : null}

      {/* Creating from here spans classes, so the sheet takes the teacher's
          whole class list rather than being fixed to one. Editing uses this
          same sheet from the assignment detail page a row links to. */}
      <AssignmentCreationSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        entryPoint="dashboard"
        assignmentTypes={assignmentCreationTypes}
        writingConditionsEnabled={writingConditionsEnabled}
        teacherClasses={assignmentCreationClasses}
      />
    </div>
  );
}

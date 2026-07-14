import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import {
  Form,
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Copy,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Tooltip } from '~/components/ui/tooltip';
import { useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
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
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import {
  AssignmentEditSheet,
  type AssignmentEditRecord,
} from '~/components/assignments/assignment-edit-sheet';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { parseAssignmentGradingIntent } from '~/utils/assignment-grading-intent.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export const handle = { breadcrumb: 'Assignments' };

function formatClassLabel(klass: {
  grade: string;
  period: string;
  title: string | null;
}) {
  const base = `Grade ${klass.grade} • Period ${klass.period}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

export function sanitizeAssignmentCreateReturnTo(value: string | null) {
  if (!value) return null;
  if (
    value === '/app' ||
    value.startsWith('/app/') ||
    value.startsWith('/app?')
  ) {
    return value;
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== "TEACHER") {
    return dataResponse(
      { success: false, message: 'Only teachers can manage assignments.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  const assignmentId = formData.get('assignmentId')?.toString();

  if (
    intent !== 'update-assignment' &&
    intent !== 'delete-assignment' &&
    intent !== 'delete-assignments'
  ) {
    return dataResponse(
      { success: false, message: 'Unsupported action.' },
      { status: 400 }
    );
  }

  if (intent === 'delete-assignments') {
    const assignmentIds = formData.getAll('assignmentIds') as string[];

    if (!assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Select at least one assignment.' },
        { status: 400 }
      );
    }

    const assignments = await prisma.assignment.findMany({
      where: {
        id: { in: assignmentIds },
        classAssignments: {
          some: {
            class: { teachers: { some: { id: profile.id } } },
          },
        },
      },
      select: {
        id: true,
        classAssignments: {
          select: {
            class: {
              select: {
                id: true,
                school: { select: { id: true, organizationId: true } },
              },
            },
          },
        },
      },
    });

    if (assignments.length !== assignmentIds.length) {
      return dataResponse(
        { success: false, message: 'Some assignments were not found.' },
        { status: 400 }
      );
    }

    await prisma.assignment.deleteMany({
      where: { id: { in: assignmentIds } },
    });

    return dataResponse({
      success: true,
      message: `Deleted ${assignmentIds.length} assignment(s).`,
    });
  }

  if (!assignmentId) {
    return dataResponse(
      { success: false, message: 'Assignment is required.' },
      { status: 400 }
    );
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      classAssignments: {
        some: {
          class: { teachers: { some: { id: profile.id } } },
        },
      },
    },
    select: {
      id: true,
      assignmentTypeId: true,
      assignmentType: { select: { systemKey: true } },
      classAssignments: {
        select: {
          class: {
            select: {
              id: true,
              school: { select: { id: true, organizationId: true } },
            },
          },
        },
      },
    },
  });

  if (!assignment) {
    return dataResponse(
      { success: false, message: 'Assignment not found.' },
      { status: 404 }
    );
  }

  const deploymentClasses = assignment.classAssignments.map(
    (deployment) => deployment.class
  );

  if (intent === 'delete-assignment') {
    // Documents keep their content; the assignment link is set to null by the schema.
    await prisma.assignment.delete({ where: { id: assignment.id } });
    return dataResponse({
      success: true,
      message: 'Assignment deleted successfully.',
    });
  }

  const assignmentTypeId = formData.get('assignmentTypeId')?.toString();
  const title = (formData.get('title')?.toString() ?? '').trim() || null;
  const prompt = (formData.get('prompt')?.toString() ?? '').trim();

  if (!assignmentTypeId) {
    return dataResponse(
      { success: false, message: 'Assignment type is required.' },
      { status: 400 }
    );
  }
  if (!prompt) {
    return dataResponse(
      { success: false, message: 'Prompt is required.' },
      { status: 400 }
    );
  }

  const allowedAssignmentTypes = await getAvailableAssignmentTypesForScopes<{
    id: string;
    systemKey: string | null;
  }>({
    scopes: deploymentClasses.map((klass) => ({
      organizationId: klass.school.organizationId,
      schoolId: klass.school.id,
      teacherProfileId: profile.id,
    })),
    select: { id: true, systemKey: true },
  });

  const selectedAssignmentType = allowedAssignmentTypes.find(
    (type) => type.id === assignmentTypeId
  );
  if (
    selectedAssignmentType?.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY ||
    assignment.assignmentType.systemKey === AP_HISTORY_ASSIGNMENT_TYPE_KEY
  ) {
    return dataResponse(
      {
        success: false,
        message: 'Choose an APUSH prompt from the library first.',
      },
      { status: 400 }
    );
  }

  const isPreservingCurrentArchivedType =
    assignment.assignmentTypeId === assignmentTypeId;
  if (!selectedAssignmentType && !isPreservingCurrentArchivedType) {
    return dataResponse(
      { success: false, message: 'Selected assignment type is not available.' },
      { status: 400 }
    );
  }

  const gradingIntent = parseAssignmentGradingIntent(formData);
  if (gradingIntent && !gradingIntent.success) {
    return dataResponse(
      { success: false, message: gradingIntent.message },
      { status: 400 }
    );
  }

  await prisma.assignment.update({
    where: { id: assignment.id },
    data: {
      assignmentTypeId,
      title,
      prompt,
      ...(gradingIntent?.success
        ? {
            submitForGrade: gradingIntent.data.submitForGrade,
            pointValue: gradingIntent.data.pointValue,
          }
        : {}),
    },
  });

  return dataResponse({
    success: true,
    message: 'Assignment updated successfully.',
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (profile.role !== "TEACHER") {
    return redirect('/app');
  }

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
  const hasActiveClasses = classIds.length > 0;

  const [assignments, allowedAssignmentTypes] = await Promise.all([
    hasActiveClasses
      ? prisma.assignment.findMany({
          where: {
            classAssignments: {
              some: { classId: { in: classIds } },
            },
          },
            select: {
              id: true,
              title: true,
              prompt: true,
              submitForGrade: true,
              pointValue: true,
              createdAt: true,
              assignmentTypeId: true,
              assignmentType: {
                select: { id: true, title: true, systemKey: true },
              },
              classAssignments: {
                where: { classId: { in: classIds } },
                select: {
                  id: true,
                  class: {
                    select: { id: true, grade: true, period: true, title: true },
                  },
                  _count: { select: { documents: true } },
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }],
          })
        : [],
    hasActiveClasses
      ? getAvailableAssignmentTypesForScopes<{
          id: string;
          title: string;
          systemKey: string | null;
        }>({
          scopes: classes.map((klass) => ({
            organizationId: klass.school.organizationId,
            schoolId: klass.school.id,
            teacherProfileId: profile.id,
          })),
          select: { id: true, title: true, systemKey: true },
          orderBy: { position: 'asc' },
        })
      : [],
  ]);

  const genericAssignmentTypes = allowedAssignmentTypes.filter(
    (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );

  return dataResponse({
    assignments,
    classes: classes.map((klass) => ({
      id: klass.id,
      grade: klass.grade,
      period: klass.period,
      title: klass.title,
      school: { name: klass.school.name },
    })),
    creationClasses: classes.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),
    assignmentTypes: genericAssignmentTypes.map((type) => ({
      id: type.id,
      title: type.title,
    })),
    browseAssignmentTypes: allowedAssignmentTypes.map((type) => ({
      id: type.id,
      title: type.title,
    })),
    assignmentsEnabled: hasActiveClasses,
    hasActiveClasses,
  });
}

type AssignmentRow = {
  id: string;
  title: string | null;
  prompt: string;
  submitForGrade: boolean;
  pointValue: number | null;
  createdAt: Date | string;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string; systemKey: string | null };
  classAssignments: Array<{
    id: string;
    class: { id: string; grade: string; period: string; title: string | null };
    _count: { documents: number };
  }>;
};

export default function AssignmentsRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [duplicateAssignment, setDuplicateAssignment] =
    useState<AssignmentRow | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null
  );
  const [createAssignmentTypeId, setCreateAssignmentTypeId] = useState<
    string | undefined
  >();
  const [createReturnTo, setCreateReturnTo] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('create') !== '1') {
      return;
    }

    const assignmentTypeId = searchParams.get('assignmentType') ?? undefined;
    if (
      assignmentTypeId &&
      data.assignmentTypes.some((type) => type.id === assignmentTypeId)
    ) {
      setCreateAssignmentTypeId(assignmentTypeId);
    } else {
      setCreateAssignmentTypeId(undefined);
    }

    setCreateReturnTo(
      sanitizeAssignmentCreateReturnTo(searchParams.get('returnTo'))
    );
    setIsCreateSheetOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    next.delete('assignmentType');
    next.delete('returnTo');
    setSearchParams(next, { replace: true });
  }, [data.assignmentTypes, searchParams, setSearchParams]);

  const classFilter = searchParams.get('class') ?? 'all';
  const typeFilter = searchParams.get('type') ?? 'all';

  const assignments = data.assignments as AssignmentRow[];

  const typeOptions = useMemo(() => {
    const byId = new Map<string, { id: string; title: string }>();
    for (const assignment of assignments) {
      byId.set(assignment.assignmentType.id, {
        id: assignment.assignmentType.id,
        title: assignment.assignmentType.title,
      });
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.title.localeCompare(b.title)
    );
  }, [assignments]);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (assignment) =>
          (classFilter === 'all' ||
            assignment.classAssignments.some(
              (deployment) => deployment.class.id === classFilter
            )) &&
          (typeFilter === 'all' || assignment.assignmentType.id === typeFilter)
      ),
    [assignments, classFilter, typeFilter]
  );

  const hasFilters = classFilter !== 'all' || typeFilter !== 'all';

  const editingAssignment: (AssignmentRow & AssignmentEditRecord) | null =
    useMemo(
      () =>
        assignments.find(
          (candidate) => candidate.id === editingAssignmentId
        ) ?? null,
      [assignments, editingAssignmentId]
    );

  const {
    selected: selectedAssignmentIds,
    setSelected: setSelectedAssignmentIds,
    handleSelectAll,
    handleSelect,
  } = useTable({ rows: filteredAssignments });

  const selectedAssignments = useMemo(
    () =>
      filteredAssignments.filter((assignment) =>
        selectedAssignmentIds.includes(assignment.id)
      ),
    [filteredAssignments, selectedAssignmentIds]
  );

  const canEditSelectedAssignment =
    selectedAssignments.length === 1 &&
    selectedAssignments[0]!.assignmentType.systemKey !==
      AP_HISTORY_ASSIGNMENT_TYPE_KEY;

  const updateFilter = (key: 'class' | 'type', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2>Assignments</h2>
              <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[460px]">
                Create assignments and apply them to your classes. Grading
                lives in Documents.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-3 py-4 pb-24 sm:px-5">
        {!data.hasActiveClasses ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <span className="text-lg font-bold">
              No active classes
            </span>
            <span className="text-sm text-muted-foreground">
              You are not assigned to any active classes yet.
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={classFilter}
                onValueChange={(value) => updateFilter('class', value)}
              >
                <SelectTrigger className="w-[240px] bg-background">
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
                value={typeFilter}
                onValueChange={(value) => updateFilter('type', value)}
              >
                <SelectTrigger className="w-[220px] bg-background">
                  <SelectValue placeholder="All assignment types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignment types</SelectItem>
                  {typeOptions.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.delete('class');
                    next.delete('type');
                    setSearchParams(next, { replace: true });
                  }}
                >
                  <X className="h-4 w-4" />
                  Clear
                </Button>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              {selectedAssignmentIds.length > 0 ? (
                <>
                  <Tooltip
                    text={
                      canEditSelectedAssignment
                        ? 'Edit assignment'
                        : selectedAssignments.length === 1
                          ? 'Edit this assignment from the APUSH library'
                          : 'Select one assignment to edit'
                    }
                  >
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      disabled={!canEditSelectedAssignment}
                      aria-label="Edit selected assignment"
                      onClick={() => {
                        if (!canEditSelectedAssignment) return;
                        setEditingAssignmentId(selectedAssignments[0]!.id);
                        setSelectedAssignmentIds([]);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                  <Form
                    method="post"
                    className="inline"
                    onSubmit={(event) => {
                      const count = selectedAssignmentIds.length;
                      if (
                        !window.confirm(
                          count === 1
                            ? 'Delete this assignment? Existing student documents will remain, but they will no longer be linked to this assignment.'
                            : `Delete ${count} assignments? Existing student documents will remain, but they will no longer be linked to these assignments.`
                        )
                      ) {
                        event.preventDefault();
                        return;
                      }
                      setSelectedAssignmentIds([]);
                    }}
                  >
                    <input
                      type="hidden"
                      name="intent"
                      value="delete-assignments"
                    />
                    {selectedAssignmentIds.map((id) => (
                      <input
                        key={id}
                        type="hidden"
                        name="assignmentIds"
                        value={id}
                      />
                    ))}
                    <Tooltip
                      text={`Delete ${selectedAssignmentIds.length} assignment(s)`}
                    >
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        aria-label={`Delete ${selectedAssignmentIds.length} assignment(s)`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </Form>
                </>
              ) : null}
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => setIsCreateSheetOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Assignment
              </Button>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12 text-center">
                <span className="text-lg font-bold">
                  {hasFilters ? 'No assignments match' : 'No assignments yet'}
                </span>
                <span className="text-sm text-muted-foreground">
                  {hasFilters
                    ? 'Try clearing a filter.'
                    : 'Create your first assignment to get started.'}
                </span>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/50">
                <Table aria-label="Assignments">
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
                      <TableHead>Assignment</TableHead>
                      <TableHead>Assignment Type</TableHead>
                      <TableHead>Applied to</TableHead>
                      <TableHead>Class summary</TableHead>
                      <TableHead className="pr-4">Documents</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.map((assignment) => {
                      const canEdit =
                        assignment.assignmentType.systemKey !==
                        AP_HISTORY_ASSIGNMENT_TYPE_KEY;

                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="max-h-[37px] pl-4">
                            <Checkbox
                              aria-label={`Select assignment ${
                                assignment.title?.trim() ||
                                'Untitled Assignment'
                              }`}
                              checked={selectedAssignmentIds.includes(
                                assignment.id
                              )}
                              onCheckedChange={() =>
                                handleSelect(assignment.id)
                              }
                            />
                          </TableCell>
                          <TableCell className="max-w-[320px] font-medium">
                            <div className="flex items-start gap-2">
                            <button
                              type="button"
                              data-testid={`assignment-open-${assignment.id}`}
                              className={cn(
                                'flex min-w-0 flex-1 flex-col gap-1 text-left',
                                canEdit
                                  ? 'cursor-pointer hover:text-primary'
                                  : 'cursor-default text-foreground'
                              )}
                              disabled={!canEdit}
                              onClick={() =>
                                setEditingAssignmentId(assignment.id)
                              }
                            >
                              <span>
                                {assignment.title?.trim() ||
                                  'Untitled Assignment'}
                              </span>
                              <span className="line-clamp-1 text-xs font-normal text-muted-foreground">
                                {assignment.prompt}
                              </span>
                            </button>
                            {canEdit ? (
                              <Tooltip text="Duplicate">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label="Duplicate"
                                  onClick={() => {
                                    setDuplicateAssignment(assignment);
                                    setIsCreateSheetOpen(true);
                                  }}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </Tooltip>
                            ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {assignment.assignmentType.title}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {assignment.classAssignments.map((deployment) => (
                                <Link
                                  key={deployment.id}
                                  to={`/app/my-classes/${deployment.class.id}?tab=documents&classAssignmentId=${deployment.id}`}
                                  className="text-sm hover:underline"
                                >
                                  {formatClassLabel(deployment.class)}
                                </Link>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {assignment.classAssignments.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {assignment.classAssignments.map((deployment) => (
                                  <Link
                                    key={deployment.id}
                                    to={`/app/my-classes/${deployment.class.id}/assignments/${assignment.id}`}
                                    title={`Class performance summary — ${formatClassLabel(
                                      deployment.class
                                    )}`}
                                    className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
                                  >
                                    {assignment.classAssignments.length > 1
                                      ? formatClassLabel(deployment.class)
                                      : 'Summary'}
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="pr-4">
                            <Badge variant="secondary" size="sm">
                              {assignment.classAssignments.reduce(
                                (total, deployment) =>
                                  total + deployment._count.documents,
                                0
                              )}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {data.browseAssignmentTypes.length > 0 ? (
              <div className="mt-2">
                <p className="mb-2 text-sm font-medium text-muted-foreground">
                  Assignment Types
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.browseAssignmentTypes.map((type) => (
                    <Link
                      key={type.id}
                      to={`/app/assignment-types/${type.id}`}
                      className="rounded-md border bg-background px-2.5 py-1 text-sm text-foreground transition-colors hover:bg-muted"
                    >
                      {type.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <AssignmentCreationSheet
        open={isCreateSheetOpen}
        onOpenChange={(open) => {
          setIsCreateSheetOpen(open);
          if (!open) {
            const returnTo = createReturnTo;
            setDuplicateAssignment(null);
            setCreateAssignmentTypeId(undefined);
            setCreateReturnTo(null);
            if (returnTo) {
              navigate(returnTo, { replace: true });
            }
          }
        }}
        entryPoint="dashboard"
        assignmentTypes={data.assignmentTypes}
        teacherClasses={data.creationClasses}
        fixedAssignmentTypeId={duplicateAssignment?.assignmentTypeId}
        initialAssignmentTypeId={createAssignmentTypeId}
        initialTitle={
          duplicateAssignment
            ? `Copy of ${
                duplicateAssignment.title?.trim() || 'Untitled Assignment'
              }`
            : undefined
        }
        initialPrompt={duplicateAssignment?.prompt}
      />

      {editingAssignment ? (
        <AssignmentEditSheet
          open
          onOpenChange={(open) => {
            if (!open) setEditingAssignmentId(null);
          }}
          pdfClassId={
            editingAssignment.classAssignments[0]?.class.id ?? ''
          }
          allowedAssignmentTypes={data.assignmentTypes}
          editingAssignment={editingAssignment}
        />
      ) : null}
    </section>
  );
}

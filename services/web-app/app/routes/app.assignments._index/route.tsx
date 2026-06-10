import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useLoaderData, useSearchParams } from 'react-router';
import { useMemo, useState } from 'react';
import { ClipboardList, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
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
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import {
  AssignmentEditSheet,
  type AssignmentEditRecord,
} from '~/components/assignments/assignment-edit-sheet';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { parseAssignmentGradingIntent } from '~/utils/assignment-grading-intent.server';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { formatDateOnly } from '~/utils/date-only';
import {
  getAssignmentCreationStandardizationEnabledClassIdsForContext,
  getAssignmentsEnabledClassIdsForContext,
} from '~/utils/feature-flags.server';

export const handle = { breadcrumb: 'Assignments' };

function parseDateOnlyToUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function formatClassLabel(klass: {
  grade: string;
  period: string;
  title: string | null;
}) {
  const base = `Grade ${klass.grade} • Period ${klass.period}`;
  return klass.title ? `${base} — ${klass.title}` : base;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    return dataResponse(
      { success: false, message: 'Only teachers can manage assignments.' },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const intent = formData.get('intent')?.toString();
  const assignmentId = formData.get('assignmentId')?.toString();

  if (intent !== 'update-assignment' && intent !== 'delete-assignment') {
    return dataResponse(
      { success: false, message: 'Unsupported action.' },
      { status: 400 }
    );
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
      class: { teachers: { some: { id: profile.teacherProfile.id } } },
    },
    select: {
      id: true,
      classId: true,
      assignmentTypeId: true,
      tutorContext: true,
      assignmentType: { select: { systemKey: true } },
      class: {
        select: {
          id: true,
          school: { select: { id: true, organizationId: true } },
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

  const enabledClassIds = await getAssignmentsEnabledClassIdsForContext({
    organizationId: assignment.class.school.organizationId,
    teacherProfileId: profile.teacherProfile.id,
    classes: [
      {
        id: assignment.class.id,
        organizationId: assignment.class.school.organizationId,
        schoolId: assignment.class.school.id,
      },
    ],
  });
  if (!enabledClassIds.includes(assignment.class.id)) {
    return dataResponse(
      {
        success: false,
        message: 'Assignments are not enabled for your organization.',
      },
      { status: 403 }
    );
  }

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
  const legacyTutorContext =
    (formData.get('tutorContext')?.toString() ?? '').trim() || null;
  const dueDateInput = (formData.get('dueDate')?.toString() ?? '').trim();
  const dueDate = dueDateInput ? parseDateOnlyToUtc(dueDateInput) : null;

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
  if (dueDateInput && !dueDate) {
    return dataResponse(
      { success: false, message: 'Due date is invalid.' },
      { status: 400 }
    );
  }

  const allowedAssignmentTypes = await getAvailableAssignmentTypesForScopes<{
    id: string;
    systemKey: string | null;
  }>({
    scopes: [
      {
        organizationId: assignment.class.school.organizationId,
        schoolId: assignment.class.school.id,
        teacherProfileId: profile.teacherProfile.id,
      },
    ],
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

  const standardizationEnabledClassIds =
    await getAssignmentCreationStandardizationEnabledClassIdsForContext({
      organizationId: assignment.class.school.organizationId,
      teacherProfileId: profile.teacherProfile.id,
      classes: [
        {
          id: assignment.class.id,
          organizationId: assignment.class.school.organizationId,
          schoolId: assignment.class.school.id,
        },
      ],
    });
  const standardizationEnabled = standardizationEnabledClassIds.includes(
    assignment.class.id
  );

  const gradingIntent = standardizationEnabled
    ? parseAssignmentGradingIntent(formData)
    : null;
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
      tutorContext: standardizationEnabled
        ? assignment.tutorContext
        : legacyTutorContext,
      dueDate,
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
  const profile = await requireProfile(request, userId);
  if (!profile.teacherProfile) {
    return redirect('/app');
  }

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
    },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const enabledClassIds = await getAssignmentsEnabledClassIdsForContext({
    organizationId: profile.organization.id,
    teacherProfileId: profile.teacherProfile.id,
    classes: classes.map((klass) => ({
      id: klass.id,
      organizationId: klass.school.organizationId,
      schoolId: klass.school.id,
    })),
  });
  const enabledClasses = classes.filter((klass) =>
    enabledClassIds.includes(klass.id)
  );
  const assignmentsEnabled = enabledClasses.length > 0;

  const [assignments, allowedAssignmentTypes, standardizedClassIds] =
    await Promise.all([
      assignmentsEnabled
        ? prisma.assignment.findMany({
            where: { classId: { in: enabledClassIds } },
            select: {
              id: true,
              title: true,
              prompt: true,
              tutorContext: true,
              submitForGrade: true,
              pointValue: true,
              dueDate: true,
              createdAt: true,
              assignmentTypeId: true,
              assignmentType: {
                select: { id: true, title: true, systemKey: true },
              },
              class: {
                select: { id: true, grade: true, period: true, title: true },
              },
              _count: { select: { documents: true } },
            },
            orderBy: [{ createdAt: 'desc' }],
          })
        : [],
      assignmentsEnabled
        ? getAvailableAssignmentTypesForScopes<{
            id: string;
            title: string;
            systemKey: string | null;
          }>({
            scopes: enabledClasses.map((klass) => ({
              organizationId: klass.school.organizationId,
              schoolId: klass.school.id,
              teacherProfileId: profile.teacherProfile!.id,
            })),
            select: { id: true, title: true, systemKey: true },
            orderBy: { position: 'asc' },
          })
        : [],
      assignmentsEnabled
        ? getAssignmentCreationStandardizationEnabledClassIdsForContext({
            organizationId: profile.organization.id,
            teacherProfileId: profile.teacherProfile.id,
            classes: enabledClasses.map((klass) => ({
              id: klass.id,
              organizationId: klass.school.organizationId,
              schoolId: klass.school.id,
            })),
          })
        : [],
    ]);

  const genericAssignmentTypes = allowedAssignmentTypes.filter(
    (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
  );
  const standardizedClassIdSet = new Set(standardizedClassIds);
  const standardizedClasses = enabledClasses.filter((klass) =>
    standardizedClassIdSet.has(klass.id)
  );
  const assignmentCreationStandardizationEnabled =
    standardizedClasses.length > 0;
  const creationClasses = assignmentCreationStandardizationEnabled
    ? standardizedClasses
    : enabledClasses;

  return dataResponse({
    assignments,
    classes: enabledClasses.map((klass) => ({
      id: klass.id,
      grade: klass.grade,
      period: klass.period,
      title: klass.title,
      school: { name: klass.school.name },
    })),
    creationClasses: creationClasses.map((klass) => ({
      id: klass.id,
      name: formatClassLabel(klass),
    })),
    assignmentTypes: genericAssignmentTypes.map((type) => ({
      id: type.id,
      title: type.title,
    })),
    assignmentsEnabled,
    assignmentCreationStandardizationEnabled,
  });
}

type AssignmentRow = {
  id: string;
  title: string | null;
  prompt: string;
  tutorContext: string | null;
  submitForGrade: boolean;
  pointValue: number | null;
  dueDate: Date | string | null;
  createdAt: Date | string;
  assignmentTypeId: string;
  assignmentType: { id: string; title: string; systemKey: string | null };
  class: { id: string; grade: string; period: string; title: string | null };
  _count: { documents: number };
};

export default function AssignmentsRoute() {
  const data = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null
  );
  const [duplicatingAssignmentId, setDuplicatingAssignmentId] = useState<
    string | null
  >(null);

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
          (classFilter === 'all' || assignment.class.id === classFilter) &&
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

  const duplicatingAssignment = useMemo(
    () =>
      assignments.find(
        (candidate) => candidate.id === duplicatingAssignmentId
      ) ?? null,
    [assignments, duplicatingAssignmentId]
  );

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
                lives in Student Work.
              </p>
            </div>
            {data.assignmentsEnabled ? (
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => setIsCreateSheetOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Assignment
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-3 py-4 pb-24 sm:px-5">
        {!data.assignmentsEnabled ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <span className="text-lg font-bold">
              Assignments are not enabled
            </span>
            <span className="text-sm text-muted-foreground">
              Assignments are not enabled for your organization yet.
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
                {!hasFilters ? (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => setIsCreateSheetOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New Assignment
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table aria-label="Assignments">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Assignment Type</TableHead>
                      <TableHead>Applied to</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAssignments.map((assignment) => {
                      const canEdit =
                        assignment.assignmentType.systemKey !==
                        AP_HISTORY_ASSIGNMENT_TYPE_KEY;
                      return (
                        <TableRow key={assignment.id}>
                          <TableCell className="max-w-[260px] font-medium">
                            <div className="flex flex-col gap-1">
                              <span>
                                {assignment.title?.trim() ||
                                  'Untitled Assignment'}
                              </span>
                              <span className="line-clamp-1 text-xs font-normal text-muted-foreground">
                                {assignment.prompt}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {assignment.assignmentType.title}
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/app/my-classes/${assignment.class.id}?tab=documents&assignmentId=${assignment.id}`}
                              className="text-sm hover:underline"
                            >
                              {formatClassLabel(assignment.class)}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {assignment.dueDate
                              ? formatDateOnly(assignment.dueDate)
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" size="sm">
                              {assignment._count.documents}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {canEdit ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() =>
                                    setEditingAssignmentId(assignment.id)
                                  }
                                >
                                  <Pencil className="mr-1 h-3.5 w-3.5" />
                                  Edit
                                </Button>
                              ) : null}
                              {canEdit ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  onClick={() =>
                                    setDuplicatingAssignmentId(assignment.id)
                                  }
                                >
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Duplicate
                                </Button>
                              ) : null}
                              <Form
                                method="post"
                                onSubmit={(event) => {
                                  if (
                                    !window.confirm(
                                      'Delete this assignment? Existing student documents will remain, but they will no longer be linked to this assignment.'
                                    )
                                  ) {
                                    event.preventDefault();
                                  }
                                }}
                              >
                                <input
                                  type="hidden"
                                  name="intent"
                                  value="delete-assignment"
                                />
                                <input
                                  type="hidden"
                                  name="assignmentId"
                                  value={assignment.id}
                                />
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  type="submit"
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  Delete
                                </Button>
                              </Form>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>

      <AssignmentCreationSheet
        open={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        entryPoint="dashboard"
        assignmentTypes={data.assignmentTypes}
        teacherClasses={data.creationClasses}
        assignmentCreationStandardizationEnabled={
          data.assignmentCreationStandardizationEnabled
        }
      />

      {duplicatingAssignment ? (
        <AssignmentCreationSheet
          open
          onOpenChange={(open) => {
            if (!open) setDuplicatingAssignmentId(null);
          }}
          entryPoint="dashboard"
          assignmentTypes={data.assignmentTypes}
          teacherClasses={data.creationClasses}
          assignmentCreationStandardizationEnabled={
            data.assignmentCreationStandardizationEnabled
          }
          fixedAssignmentTypeId={
            data.assignmentTypes.some(
              (type) => type.id === duplicatingAssignment.assignmentTypeId
            )
              ? duplicatingAssignment.assignmentTypeId
              : undefined
          }
          initialTitle={`Copy of ${
            duplicatingAssignment.title?.trim() || 'Untitled Assignment'
          }`}
          initialPrompt={duplicatingAssignment.prompt}
          initialTutorContext={duplicatingAssignment.tutorContext ?? ''}
        />
      ) : null}

      {editingAssignment ? (
        <AssignmentEditSheet
          open
          onOpenChange={(open) => {
            if (!open) setEditingAssignmentId(null);
          }}
          pdfClassId={editingAssignment.class.id}
          allowedAssignmentTypes={data.assignmentTypes}
          assignmentCreationStandardizationEnabled={
            data.assignmentCreationStandardizationEnabled
          }
          editingAssignment={editingAssignment}
        />
      ) : null}
    </section>
  );
}

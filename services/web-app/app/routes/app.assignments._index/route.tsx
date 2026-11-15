import { useFreeAccountUsage } from '~/components/free-account-usage';
import { PreviewAssignmentCreationControl } from '~/components/free-tier/preview-assignment-creation-control';
import {
  FreeTierLockedPageHeader,
  freeTierStandardPageBodyClassName,
  freeTierStandardPageShellClassName,
  useFreeTierLockedB2PageChrome,
  useFreeTierStandardPageShell,
} from '~/components/free-tier/free-tier-teacher-page-chrome';
import { useTeachingAccess } from '~/components/free-tier/teaching-access-context';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Form, Link, useFetcher, useLoaderData, useSearchParams, useSubmit } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { FilterPills } from '~/components/ui/filter-pills';
import { SortableTableHeadButton } from '~/components/ui/sortable-table-head-button';
import { Badge } from '~/components/ui/badge';
import { MultiSelect } from '~/components/multi-select';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';

type AssignmentGroupMode = 'none' | 'class' | 'type';
type AssignmentSortField = 'created' | 'title' | 'type' | 'documents';
type AssignmentSort = { field: AssignmentSortField; direction: 'asc' | 'desc' };
const DEFAULT_ASSIGNMENT_SORT: AssignmentSort = { field: 'created', direction: 'desc' };
import { useNavigateToNewAssignmentPage } from '~/domain/free-tier/navigate-to-new-assignment-page';
import { TutorOffBadge } from '~/components/assignments/tutor-off-badge';
import { AssignmentTryItPill } from '~/components/assignments/assignment-try-it-pill';
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
import { HIDE_AP_HISTORY_CLASS_ASSIGNMENT_WHERE } from '~/utils/assignment-type-access.server';
import { CollapsibleGroupSection } from '~/components/collapsible-group-section';
import { ASSIGNMENTS_GROUPED_BY_TYPE_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { groupByAssignmentType } from '~/utils/group-by-assignment-type';
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
import {
  filterAssignmentTypesForOrganizationPlan,
  loadAssignmentCreationQuotasForTypes,
} from '~/utils/assignment-quota.server';
import { getAvailableAssignmentTypesForScopes } from '~/utils/assignment-type-access.server';
import { prisma } from '~/utils/db.server';
import { safeDomainErrorTextForClientResponse } from '~/utils/server-error-request-context.server';
import {
  resolveTeacherSchoolYearScope,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import { formatClassLabel } from '~/utils/teacher-document-work-utils';
import { getGrammarGradingAssignmentTypeIds } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { loadSiteLicenseLockedAssignmentTiles } from '~/domain/free-tier/site-license-locked-assignment-tiles.server';
import { cn } from '~/utils/misc';

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
      ...HIDE_AP_HISTORY_CLASS_ASSIGNMENT_WHERE,
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
          assignmentTypeId: true,
          assignmentType: { select: { title: true } },
          createdAt: true,
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
      assignmentTypeId: string;
      assignmentTypeTitle: string;
      tutorEnabled: boolean;
      createdAt: string;
      documentCount: number;
      classes: { id: string; label: string }[];
    }
  >();

  for (const classAssignment of classAssignments) {
    const existing = assignmentsById.get(classAssignment.assignment.id);
    const entry = existing ?? {
      assignmentId: classAssignment.assignment.id,
      title: classAssignment.assignment.title?.trim() || 'Untitled Assignment',
      assignmentTypeId: classAssignment.assignment.assignmentTypeId,
      assignmentTypeTitle: classAssignment.assignment.assignmentType.title,
      // A property of the Assignment, so it is the same across every class the
      // assignment was deployed to; collapsing rows cannot disagree about it.
      tutorEnabled: classAssignment.assignment.tutorEnabled,
      createdAt: classAssignment.assignment.createdAt.toISOString(),
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
          rubric: { name: string } | null;
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
            rubric: { select: { name: true } },
          },
          orderBy: { position: 'asc' },
        })
      : [];

  const savedAssignments = SAVED_ASSIGNMENTS_ENABLED
    ? await listSavedAssignments({ membershipId: profile.id })
    : [];

  // AP History assignments are built from their own library rather than a
  // free-text prompt, so they are not offered here.
  const creationTypeRows = filterAssignmentTypesForOrganizationPlan<
    (typeof availableAssignmentTypes)[number]
  >(
    profile.organization,
    availableAssignmentTypes.filter(
      (type) => type.systemKey !== AP_HISTORY_ASSIGNMENT_TYPE_KEY
    )
  );
  const gradesGrammarIds = await getGrammarGradingAssignmentTypeIds(
    creationTypeRows.map((type) => type.id)
  );
  const siteLicenseLockedAssignmentTiles =
    await loadSiteLicenseLockedAssignmentTiles(profile.organization);

  return {
    assignments,
    savedAssignments,
    assignmentsGroupedByTypeEnabled: await isFeatureFlagEnabled(
      ASSIGNMENTS_GROUPED_BY_TYPE_FLAG,
      profile.organization.id
    ),
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
        kind: type.kind,
        rubricName: type.rubric?.name ?? null,
        collaborationSupported: type.collaborationSupported,
        gradesGrammar: gradesGrammarIds.has(type.id),
        ...quotaByTypeId.get(type.id),
      }));
    })(),
    siteLicenseLockedAssignmentTiles,
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
          {
            success: false,
            message: safeDomainErrorTextForClientResponse(
              error,
              'This assignment has shared group work and cannot be deleted.',
            ),
          },
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
  const freeUsage = useFreeAccountUsage();
  const navigateToNewAssignmentPage = useNavigateToNewAssignmentPage();
  const { locked: teachingLocked, state: teachingAccessState } =
    useTeachingAccess();
  const teachingAccessAdminName =
    teachingAccessState.variant === 'locked'
      ? teachingAccessState.adminName
      : 'your administrator';
  const {
    assignments,
    savedAssignments,
    assignmentCreationClasses,
    assignmentCreationTypes,
    siteLicenseLockedAssignmentTiles,
    assignmentsGroupedByTypeEnabled: groupedByTypeFlag,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const highlightAssignmentId = searchParams.get('highlightAssignment');
  const submit = useSubmit();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [classFilterIds, setClassFilterIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [groupMode, setGroupMode] = useState<AssignmentGroupMode>('none');
  // Newest first until the teacher sorts by a column.
  const [sort, setSort] = useState<AssignmentSort>(DEFAULT_ASSIGNMENT_SORT);
  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });
  const groupedByType = groupedByTypeFlag;
  const [collapsedTypeIds, setCollapsedTypeIds] = useState<Set<string>>(
    () => new Set()
  );

  const newestFirst = useMemo(() => {
    const byCreated = (a: (typeof assignments)[number], b: (typeof assignments)[number]) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt);
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...assignments].sort((a, b) => {
      let result = 0;
      if (sort.field === 'created') {
        result = -byCreated(a, b);
      } else if (sort.field === 'title') {
        result = collator.compare(a.title, b.title);
      } else if (sort.field === 'type') {
        result = collator.compare(a.assignmentTypeTitle, b.assignmentTypeTitle);
      } else {
        result = a.documentCount - b.documentCount;
      }
      // Ties fall back to newest first.
      return result * direction || byCreated(a, b);
    });
  }, [assignments, collator, sort]);

  const sortHead = (label: string, field: AssignmentSortField) => {
    const active = sort.field === field;
    return (
      <SortableTableHeadButton
        label={label}
        arrow={active ? (sort.direction === 'asc' ? 'up' : 'down') : null}
        ariaLabel={`Sort assignments by ${label.toLowerCase()} ${
          active && sort.direction === 'asc' ? 'descending' : 'ascending'
        }`}
        onClick={() =>
          setSort((current) =>
            current.field === field
              ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
              : { field, direction: 'asc' }
          )
        }
      />
    );
  };

  // Everything except the type pill, so each pill can count what it would show.
  const matchingNonTypeFilters = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return newestFirst.filter((assignment) => {
      if (
        classFilterIds.length > 0 &&
        !assignment.classes.some((klass) => classFilterIds.includes(klass.id))
      ) {
        return false;
      }
      if (!query) return true;
      return (
        assignment.title.toLowerCase().includes(query) ||
        assignment.classLabel.toLowerCase().includes(query) ||
        assignment.assignmentTypeTitle.toLowerCase().includes(query)
      );
    });
  }, [newestFirst, classFilterIds, searchQuery]);

  // Only the types this teacher has actually assigned, in first-seen
  // (newest) order.
  const typePills = useMemo(() => {
    const byType = new Map<string, { title: string; count: number }>();
    for (const assignment of newestFirst) {
      if (!byType.has(assignment.assignmentTypeId)) {
        byType.set(assignment.assignmentTypeId, {
          title: assignment.assignmentTypeTitle,
          count: 0,
        });
      }
    }
    for (const assignment of matchingNonTypeFilters) {
      const entry = byType.get(assignment.assignmentTypeId);
      if (entry) entry.count += 1;
    }
    return [...byType.entries()].map(([id, { title, count }]) => ({
      value: id,
      label: title,
      count,
    }));
  }, [newestFirst, matchingNonTypeFilters]);

  useEffect(() => {
    if (
      typeFilter !== 'all' &&
      !typePills.some((pill) => pill.value === typeFilter)
    ) {
      setTypeFilter('all');
    }
  }, [typeFilter, typePills]);

  const filteredAssignments = useMemo(
    () =>
      typeFilter === 'all'
        ? matchingNonTypeFilters
        : matchingNonTypeFilters.filter(
            (assignment) => assignment.assignmentTypeId === typeFilter
          ),
    [matchingNonTypeFilters, typeFilter]
  );

  const classOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const assignment of assignments) {
      for (const klass of assignment.classes) byId.set(klass.id, klass.label);
    }
    return [...byId.entries()]
      .map(([id, label]) => ({ value: id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assignments]);

  const paginatedAssignments = filteredAssignments.slice(
    pagination.skip,
    pagination.skip + pagination.take
  );

  // Grouped views show every match; the list view pages.
  const typeGroups = useMemo(
    () =>
      groupedByType
        ? groupByAssignmentType({
            items: filteredAssignments,
            getAssignmentType: (assignment) => ({
              id: assignment.assignmentTypeId,
              title: assignment.assignmentTypeTitle,
            }),
            collator,
          })
        : [],
    [collator, filteredAssignments, groupedByType]
  );

  const assignmentGroups = useMemo(() => {
    if (groupedByType || groupMode === 'none') return null;
    const groups = new Map<
      string,
      { key: string; label: string; rows: typeof filteredAssignments }
    >();
    for (const assignment of filteredAssignments) {
      const keys =
        groupMode === 'class'
          ? assignment.classes.map((klass) => ({
              key: klass.id,
              label: klass.label,
            }))
          : [
              {
                key: assignment.assignmentTypeId,
                label: assignment.assignmentTypeTitle,
              },
            ];
      for (const { key, label } of keys) {
        const group = groups.get(key) ?? { key, label, rows: [] };
        group.rows.push(assignment);
        groups.set(key, group);
      }
    }
    const list = [...groups.values()];
    return groupMode === 'class'
      ? list.sort((a, b) => a.label.localeCompare(b.label))
      : list;
  }, [filteredAssignments, groupMode]);

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

  const toggleSelectedGroup = (ids: string[], checked: boolean) => {
    setSelectedAssignmentIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return Array.from(next);
    });
  };

  useEffect(() => {
    setPagination((current) => ({ ...current, skip: 0 }));
  }, [searchQuery, typeFilter, classFilterIds, groupMode, sort]);

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

  // A row that a filter or a delete took away must not stay selected, or the
  // delete action acts on assignments the teacher can no longer see.
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
  const freeTierB2 = useFreeTierLockedB2PageChrome();
  const freeTierShell = useFreeTierStandardPageShell();

  const outOfFreeAssignments = Boolean(
    !freeUsage?.monthly && freeUsage?.allAssignmentsUsed
  );
  const activeFilterCount = [
    classFilterIds.length > 0,
    searchQuery.trim().length > 0,
  ].filter(Boolean).length;

  const deleteSelected = () => {
    const count = selectedAssignmentIds.length;
    if (
      !window.confirm(
        count === 1
          ? 'Delete this assignment from your classes? Solo student documents will remain. Assignments with shared group work cannot be deleted.'
          : `Delete ${count} assignments from your classes? Solo student documents will remain. Assignments with shared group work cannot be deleted.`
      )
    ) {
      return;
    }
    const formData = new FormData();
    formData.set('intent', 'delete-assignments');
    for (const id of selectedAssignmentIds) formData.append('assignmentIds', id);
    setSelectedAssignmentIds([]);
    submit(formData, { method: 'post' });
  };

  const renderRow = (
    assignment: (typeof filteredAssignments)[number],
    keyPrefix = ''
  ) => (
    <TableRow
      key={`${keyPrefix}${assignment.assignmentId}`}
      className={cn(
        'h-11',
        highlightAssignmentId === assignment.assignmentId &&
          'ring-2 ring-primary ring-inset'
      )}
      data-state={
        selectedAssignmentIds.includes(assignment.assignmentId)
          ? 'selected'
          : undefined
      }
    >
      <TableCell className="h-11 px-4 align-middle">
        <Checkbox
          aria-label={`Select assignment ${assignment.title}`}
          checked={selectedAssignmentIds.includes(assignment.assignmentId)}
          onCheckedChange={() => handleSelect(assignment.assignmentId)}
        />
      </TableCell>
      <TableCell className="h-11 px-4 align-middle font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={assignment.href}
            className="[overflow-wrap:anywhere] hover:underline"
            data-testid={`my-assignment-open-${assignment.assignmentId}`}
          >
            {assignment.title}
          </Link>
          <AssignmentTryItPill
            assignment={{
              id: assignment.assignmentId,
              assignmentTypeId: assignment.assignmentTypeId,
              classId:
                assignment.classes.length === 1
                  ? assignment.classes[0]?.id
                  : undefined,
            }}
          />
          <TutorOffBadge tutorEnabled={assignment.tutorEnabled} />
        </div>
      </TableCell>
      <TableCell className="h-11 px-4 align-middle text-muted-foreground">
        <AssignmentClasses classes={assignment.classes} />
      </TableCell>
      <TableCell
        className="h-11 min-w-0 px-4 align-middle text-muted-foreground md:max-w-[12rem] md:truncate md:whitespace-nowrap"
        title={assignment.assignmentTypeTitle}
      >
        {assignment.assignmentTypeTitle}
      </TableCell>
      <TableCell className="h-11 px-4 align-middle text-muted-foreground md:whitespace-nowrap">
        {assignment.documentCount}
      </TableCell>
    </TableRow>
  );

  const tableHeader = (
    <TableHeader>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableHead className="h-11 w-[50px] px-4 align-middle">
          <Checkbox
            aria-label="Select all assignments"
            checked={
              filteredAssignments.length > 0 &&
              selectedAssignmentIds.length === filteredAssignments.length
            }
            onCheckedChange={handleSelectAll}
          />
        </TableHead>
        <TableHead className="h-11 px-4 align-middle">
          {sortHead('Assignment', 'title')}
        </TableHead>
        <TableHead className="h-11 whitespace-nowrap px-4 align-middle">
          Classes
        </TableHead>
        <TableHead className="h-11 px-4 align-middle md:whitespace-nowrap">
          {sortHead('Type', 'type')}
        </TableHead>
        <TableHead className="h-11 px-4 align-middle md:whitespace-nowrap">
          {sortHead('Documents', 'documents')}
        </TableHead>
      </TableRow>
    </TableHeader>
  );

  const newAssignmentItem = (
    <DropdownMenuItem
      data-testid="my-assignments-new-assignment"
      disabled={teachingLocked || (!teachingLocked && outOfFreeAssignments)}
      onSelect={() => navigateToNewAssignmentPage()}
      className="gap-3"
    >
      <Plus className="size-4" aria-hidden />
      <span>New assignment</span>
      {teachingLocked ? (
        <span className="ml-auto text-xs text-muted-foreground">
          After approval
        </span>
      ) : outOfFreeAssignments ? (
        <span className="ml-auto text-xs text-amber-800">None left</span>
      ) : null}
    </DropdownMenuItem>
  );

  const assignmentsContent = (
    <>
      {!freeTierB2 ? (
        <h1 className="mb-6 text-2xl font-semibold">My Assignments</h1>
      ) : null}

      {SAVED_ASSIGNMENTS_ENABLED ? (
        <SavedAssignmentsPanel
          savedAssignments={savedAssignments}
          onReuse={(savedAssignment) => {
            navigateToNewAssignmentPage({
              assignmentTypeId: savedAssignment.assignmentTypeId,
              title: savedAssignment.title,
              prompt: savedAssignment.prompt,
            });
          }}
        />
      ) : null}

      <section
        className="flex min-w-0 flex-col gap-4"
        aria-label="Assigned"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:flex-1">
            {typePills.length > 0 ? (
              <FilterPills
                ariaLabel="Filter by assignment type"
                testId="my-assignments-type-pills"
                value={typeFilter}
                onChange={setTypeFilter}
                options={[
                  {
                    value: 'all',
                    label: 'All',
                    count: matchingNonTypeFilters.length,
                  },
                  ...typePills,
                ]}
              />
            ) : null}
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 rounded-full"
                  data-testid="my-assignments-filter"
                >
                  <Filter className="size-4 shrink-0" />
                  Filter
                  {activeFilterCount > 0 ? (
                    <Badge variant="secondary" size="sm">
                      {activeFilterCount}
                    </Badge>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-[min(24rem,calc(100vw-2rem))] overflow-hidden p-0 ring-1 ring-black/5"
              >
                <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Filter results</p>
                    <p className="text-xs text-muted-foreground">
                      Narrow by name or class
                    </p>
                  </div>
                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setClassFilterIds([]);
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Search
                    </span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        name="my-assignments-search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Assignments"
                        className="h-9 rounded-md border-0 bg-background pl-9 shadow-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Search assignments"
                        data-testid="my-assignments-search"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      Class
                    </span>
                    <MultiSelect
                      label="classes"
                      variant="field"
                      emptySelectionLabel="All classes"
                      values={classFilterIds}
                      options={classOptions}
                      onChange={setClassFilterIds}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {!groupedByType ? (
              <Select
                value={groupMode}
                onValueChange={(value) => setGroupMode(value as AssignmentGroupMode)}
              >
                <SelectTrigger
                  className="h-9 w-[10.5rem] rounded-full bg-background"
                  data-testid="my-assignments-group-select"
                >
                  <SelectValue placeholder="List" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">List</SelectItem>
                  <SelectItem value="class">Group by class</SelectItem>
                  <SelectItem value="type">Group by type</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {/* Actions sit at the far right, after the view controls. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  className="h-9 gap-2 rounded-full"
                  data-testid="my-assignments-actions"
                  data-tour="my-assignments-new"
                >
                  Actions
                  <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {newAssignmentItem}
                <DropdownMenuItem
                  data-testid="my-assignments-delete-selected"
                  disabled={!hasSelection}
                  onSelect={deleteSelected}
                  className="gap-3"
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span>Delete selected</span>
                  {hasSelection ? (
                    <Badge variant="secondary" size="sm" className="ml-auto">
                      {selectedAssignmentIds.length}
                    </Badge>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {assignments.length === 0 ? (
          <div
            data-tour="my-assignments-list"
            className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-12 text-center"
          >
            <span className="text-lg font-bold">No assignments yet</span>
            <span className="text-base/7 text-muted-foreground sm:text-sm/6">
              Assignments you create for your classes will show up here.
            </span>
          </div>
        ) : filteredAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/50 p-12 text-center">
            <span className="text-lg font-bold">No assignments found</span>
            <span className="text-base/7 text-muted-foreground sm:text-sm/6">
              Try a different filter or search
            </span>
          </div>
        ) : groupedByType ? (
          <div data-tour="my-assignments-list" className="space-y-3">
            {typeGroups.map((group) => {
              const ids = group.items.map((assignment) => assignment.assignmentId);
              return (
                <CollapsibleGroupSection
                  key={group.key}
                  label={group.label}
                  count={group.items.length}
                  open={!collapsedTypeIds.has(group.key)}
                  onOpenChange={(open) =>
                    setCollapsedTypeIds((current) => {
                      const next = new Set(current);
                      if (open) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  data-testid={`assignment-type-section-${group.key}`}
                  data-assignment-type-title={group.label}
                >
                  <div className="min-w-0 overflow-hidden rounded-lg border bg-muted/50">
                    <Table
                      aria-label={`My Assignments: ${group.label}`}
                      containerClassName="border-0 rounded-none"
                    >
                      {tableHeader}
                      <TableBody>
                        {group.items.map((assignment) =>
                          renderRow(assignment, `${group.key}:`)
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleGroupSection>
              );
            })}
          </div>
        ) : assignmentGroups ? (
          <div data-tour="my-assignments-list" className="flex flex-col gap-4">
            {assignmentGroups.map((group) => (
              <section
                key={group.key}
                aria-label={group.label}
                data-testid="my-assignments-group"
              >
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {group.label}
                  <span className="font-normal tabular-nums text-muted-foreground">
                    {group.rows.length}
                  </span>
                </h3>
                <div className="min-w-0 overflow-hidden rounded-lg border bg-muted/50">
                  <Table
                    aria-label={`My Assignments: ${group.label}`}
                    containerClassName="border-0 rounded-none"
                  >
                    {tableHeader}
                    <TableBody>
                      {group.rows.map((assignment) =>
                        renderRow(assignment, `${group.key}:`)
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            data-tour="my-assignments-list"
            className="min-w-0 overflow-hidden rounded-lg border bg-muted/50"
          >
            <Table
              aria-label="My Assignments"
              containerClassName="border-0 rounded-none"
            >
              {tableHeader}
              <TableBody>
                {paginatedAssignments.map((assignment) => renderRow(assignment))}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredAssignments.length > 0 && !assignmentGroups && !groupedByType ? (
          <div className="w-full min-w-0">
            <Pagination
              totalCount={filteredAssignments.length}
              skip={pagination.skip}
              take={pagination.take}
              onChange={(skip, take) => setPagination({ skip, take })}
            />
          </div>
        ) : null}
      </section>
    </>
  );

  if (freeTierShell) {
    return (
      <section className={freeTierStandardPageShellClassName()}>
        {freeTierB2 ? (
          <FreeTierLockedPageHeader title="My Assignments" />
        ) : null}
        <div className={freeTierStandardPageBodyClassName()}>
          {assignmentsContent}
        </div>
      </section>
    );
  }

  return (
    <div className="mx-auto h-full min-h-0 w-full max-w-5xl overflow-y-auto px-4 py-8">
      {assignmentsContent}
    </div>
  );
}

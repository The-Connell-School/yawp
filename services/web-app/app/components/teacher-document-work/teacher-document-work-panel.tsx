import { Link } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Search } from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Input } from '~/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { MultiSelect } from '~/components/multi-select';
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
import {
  TEACHER_DOCUMENT_STATUSES,
  TEACHER_DOCUMENT_STATUS_BADGE_CLASSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  buildTeacherDocumentWorkGroups,
  collapsedGroupKeysForGroups,
  type DocumentGroupMode,
} from '~/utils/teacher-document-work-grouping';
import {
  formatClassLabel,
  getDraftDisplayTitle,
  getTeacherDocumentWorkDetailLink,
  getTeacherDocumentWorkStatusDisplay,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import {
  assignmentMatchesClassFilters,
  dedupeFilterOptionsById,
  studentMatchesStudentFilters,
} from '~/utils/teacher-document-work-filter-options';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo';

export type TeacherDocumentWorkFilters = {
  studentIds: string[];
  classIds: string[];
  assignmentIds: string[];
  status: TeacherDocumentStatus | 'all';
  group: DocumentGroupMode;
  query: string;
};

type FilterOption = {
  id: string;
  label: string;
  classId?: string;
  classIds?: string[];
};

export type TeacherDocumentWorkPanelProps = {
  tableLabel: string;
  documents: TeacherDocumentWorkRow[];
  statusCounts: Record<TeacherDocumentStatus, number>;
  students: FilterOption[];
  classes?: FilterOption[];
  assignments: FilterOption[];
  assignmentsEnabled?: boolean;
  isDocumentSubmissionEnabled: boolean;
  exitTo: string;
  filters: TeacherDocumentWorkFilters;
  onFiltersChange: (updates: Partial<TeacherDocumentWorkFilters>) => void;
  onClearFilters: () => void;
  collapsedGroups: Set<string>;
  onCollapsedGroupsChange: (next: Set<string>) => void;
  headerActions?: React.ReactNode;
  pagination?: {
    skip: number;
    take: number;
    onChange: (skip: number, take: number) => void;
  };
  emptyMessageSecondary?: string;
  testIds?: {
    statusChips?: string;
    groupSelect?: string;
  };
  collapseAllGroupsWhenGroupChanges?: boolean;
};

export function TeacherDocumentWorkPanel({
  tableLabel,
  documents,
  statusCounts,
  students,
  classes,
  assignments,
  assignmentsEnabled = true,
  isDocumentSubmissionEnabled,
  exitTo,
  filters,
  onFiltersChange,
  onClearFilters,
  collapsedGroups,
  onCollapsedGroupsChange,
  headerActions,
  pagination,
  emptyMessageSecondary = 'Try clearing a filter or check another class.',
  testIds,
  collapseAllGroupsWhenGroupChanges = false,
}: TeacherDocumentWorkPanelProps) {
  const [searchValue, setSearchValue] = useState(filters.query);
  const previousGroupModeRef = useRef<DocumentGroupMode | null>(null);
  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );

  const showClassFilter = Boolean(classes?.length);
  const showClassColumn = showClassFilter && filters.group !== 'class';
  const showStudentColumn = filters.group !== 'student';
  const showAssignmentColumn =
    assignmentsEnabled && filters.group !== 'assignment';
  const showStatusColumn = filters.group !== 'status';

  const uniqueStudents = useMemo(
    () => dedupeFilterOptionsById(students),
    [students]
  );
  const uniqueAssignments = useMemo(
    () => dedupeFilterOptionsById(assignments),
    [assignments]
  );

  const visibleAssignments =
    filters.classIds.length > 0
      ? uniqueAssignments.filter((assignment) =>
          assignmentMatchesClassFilters(assignment, filters.classIds)
        )
      : uniqueAssignments;

  const filteredDocuments = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return documents.filter((document) => {
      if (
        !studentMatchesStudentFilters(
          document,
          filters.studentIds,
          uniqueStudents
        )
      ) {
        return false;
      }

      if (
        filters.classIds.length > 0 &&
        (!document.resolvedClass?.id ||
          !filters.classIds.includes(document.resolvedClass.id))
      ) {
        return false;
      }

      if (
        filters.assignmentIds.length > 0 &&
        (!document.assignment?.id ||
          !filters.assignmentIds.includes(document.assignment.id))
      ) {
        return false;
      }

      if (filters.status !== 'all') {
        const status = getTeacherDocumentWorkStatusDisplay(document).status;
        if (status !== filters.status) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = [
        document.title,
        document.assignment?.title,
        document.membership.user.name,
        document.membership.user.email,
        document.latestSubmission?.title,
        document.resolvedClass ? formatClassLabel(document.resolvedClass) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [documents, filters, uniqueStudents]);

  const groups = useMemo(
    () =>
      buildTeacherDocumentWorkGroups({
        documents: filteredDocuments,
        mode: filters.group,
        collator,
      }),
    [collator, filteredDocuments, filters.group]
  );

  useEffect(() => {
    if (!collapseAllGroupsWhenGroupChanges) return;
    if (previousGroupModeRef.current === filters.group) return;

    previousGroupModeRef.current = filters.group;

    if (filters.group === 'none') {
      onCollapsedGroupsChange(new Set());
      return;
    }

    onCollapsedGroupsChange(collapsedGroupKeysForGroups(groups));
  }, [
    collapseAllGroupsWhenGroupChanges,
    filters.group,
    groups,
    onCollapsedGroupsChange,
  ]);

  const documentsToRender =
    filters.group === 'none' && pagination
      ? filteredDocuments.slice(
          pagination.skip,
          pagination.skip + pagination.take
        )
      : filteredDocuments;

  const hasActiveFilters =
    filters.studentIds.length > 0 ||
    filters.classIds.length > 0 ||
    filters.assignmentIds.length > 0 ||
    filters.status !== 'all' ||
    filters.query.trim().length > 0;

  const statusChips = TEACHER_DOCUMENT_STATUSES.map((status) => ({
    status,
    count: statusCounts[status],
  }));

  const renderRows = (rows: TeacherDocumentWorkRow[]) =>
    rows.map((document) => {
      const status = getTeacherDocumentWorkStatusDisplay(document);
      const displayTitle =
        document.latestSubmission?.title?.trim() ||
        getDraftDisplayTitle(document);
      const latestSubmission = document.latestSubmission;

      return (
        <TableRow key={document.id}>
          {showStudentColumn ? (
            <TableCell className="pl-4 font-medium">
              {document.membership.user.name || document.membership.user.email}
            </TableCell>
          ) : null}
          <TableCell>{displayTitle}</TableCell>
          {showClassColumn ? (
            <TableCell className="text-muted-foreground">
              {document.resolvedClass
                ? formatClassLabel(document.resolvedClass)
                : '—'}
            </TableCell>
          ) : null}
          {showAssignmentColumn ? (
            <TableCell className="text-muted-foreground">
              {document.assignment?.title || '—'}
            </TableCell>
          ) : null}
          {showStatusColumn ? (
            <TableCell>
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className={cn(
                    status.badgeClassName,
                    'shrink-0 whitespace-nowrap'
                  )}
                >
                  {status.label}
                </Badge>
                {document.submissionCount >= 2 ? (
                  <span className="text-xs text-muted-foreground">
                    v{document.submissionCount}
                  </span>
                ) : null}
              </div>
            </TableCell>
          ) : null}
          <TableCell className="text-muted-foreground">
            {latestSubmission
              ? timeAgo(
                  new Date(
                    latestSubmission.submittedAt ?? latestSubmission.createdAt ?? document.updatedAt
                  )
                )
              : '—'}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {latestSubmission?.gradedAt
              ? timeAgo(new Date(latestSubmission.gradedAt))
              : '—'}
          </TableCell>
          <TableCell className="text-muted-foreground">
            {timeAgo(document.updatedAt)}
          </TableCell>
          <TableCell className="pr-4">
            <Button asChild size="sm" variant="link" className="h-auto px-0">
              <Link
                to={getTeacherDocumentWorkDetailLink({
                  document,
                  exitTo,
                  isDocumentSubmissionEnabled,
                })}
              >
                View
              </Link>
            </Button>
          </TableCell>
        </TableRow>
      );
    });

  const renderDocumentsTable = (
    rows: TeacherDocumentWorkRow[],
    nested = false
  ) => (
    <Table
      aria-label={tableLabel}
      containerClassName={
        nested ? 'rounded-none border-0 shadow-none' : undefined
      }
      className={nested ? undefined : 'rounded-lg bg-muted/50'}
    >
      <TableHeader>
        <TableRow>
          {showStudentColumn ? (
            <TableHead className="pl-4">Student</TableHead>
          ) : null}
          <TableHead>Document</TableHead>
          {showClassColumn ? <TableHead>Class</TableHead> : null}
          {showAssignmentColumn ? <TableHead>Assignment</TableHead> : null}
          {showStatusColumn ? <TableHead>Status</TableHead> : null}
          <TableHead>Submitted at</TableHead>
          <TableHead>Graded at</TableHead>
          <TableHead>Last edited</TableHead>
          <TableHead className="pr-4">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{renderRows(rows)}</TableBody>
    </Table>
  );

  const toolbarProps: DocumentWorkToolbarProps = {
    tableLabel,
    filters,
    statusChips,
    totalDocumentCount: Object.values(statusCounts).reduce(
      (total, count) => total + count,
      0
    ),
    searchValue,
    setSearchValue,
    students: uniqueStudents,
    classes,
    assignments: visibleAssignments,
    showClassFilter,
    hasActiveFilters,
    headerActions,
    testIds,
    onFiltersChange,
    onClearFilters,
  };

  const renderMainContent = () => (
    <>
      {filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted p-12">
          <span className="text-lg font-bold">No documents found</span>
          <span className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Try adjusting your filters'
              : emptyMessageSecondary}
          </span>
        </div>
      ) : filters.group === 'none' ? (
        <div className="relative min-h-[200px] flex-1 overflow-y-auto">
          {renderDocumentsTable(documentsToRender)}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            if (group.key === 'all') return null;
            const isOpen = !collapsedGroups.has(group.key);

            return (
              <Collapsible
                key={group.key}
                open={isOpen}
                onOpenChange={(open) => {
                  onCollapsedGroupsChange(
                    (() => {
                      const next = new Set(collapsedGroups);
                      if (open) {
                        next.delete(group.key);
                      } else {
                        next.add(group.key);
                      }
                      return next;
                    })()
                  );
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
                    {filters.group === 'status' ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          TEACHER_DOCUMENT_STATUS_BADGE_CLASSES[
                            group.key as TeacherDocumentStatus
                          ],
                          'font-semibold'
                        )}
                      >
                        {group.label}
                      </Badge>
                    ) : (
                      <span className="text-base font-semibold text-foreground">
                        {group.label}
                      </span>
                    )}
                    <Badge variant="secondary" className="ml-1">
                      {group.documents.length}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t bg-muted/50">
                    {renderDocumentsTable(group.documents, true)}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {pagination &&
      filters.group === 'none' &&
      filteredDocuments.length > 0 ? (
        <Pagination
          totalCount={filteredDocuments.length}
          skip={pagination.skip}
          take={pagination.take}
          onChange={pagination.onChange}
        />
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <DocumentWorkToolbar {...toolbarProps} />
      {renderMainContent()}
    </div>
  );
}

type DocumentWorkToolbarProps = {
  tableLabel: string;
  filters: TeacherDocumentWorkFilters;
  statusChips: Array<{ status: TeacherDocumentStatus; count: number }>;
  totalDocumentCount: number;
  searchValue: string;
  setSearchValue: (value: string) => void;
  students: FilterOption[];
  classes?: FilterOption[];
  assignments: FilterOption[];
  showClassFilter: boolean;
  hasActiveFilters: boolean;
  headerActions?: React.ReactNode;
  testIds?: TeacherDocumentWorkPanelProps['testIds'];
  onFiltersChange: (updates: Partial<TeacherDocumentWorkFilters>) => void;
  onClearFilters: () => void;
};

const DOCUMENT_WORK_GROUP_OPTIONS: Array<{
  value: DocumentGroupMode;
  label: string;
  showWhenClassFilter?: boolean;
}> = [
  { value: 'none', label: 'List' },
  { value: 'class', label: 'Group by class', showWhenClassFilter: true },
  { value: 'student', label: 'Group by student' },
  { value: 'assignment', label: 'Group by assignment' },
  { value: 'status', label: 'Group by status' },
];

function getStatusPillClasses(
  isActive: boolean,
  status?: TeacherDocumentStatus | 'all'
) {
  if (status === 'needs-grading') {
    return isActive
      ? 'bg-yellow-100 text-yellow-900 ring-1 ring-yellow-200 shadow-sm'
      : 'bg-yellow-50 text-yellow-800 hover:bg-yellow-100';
  }

  if (status === 'graded') {
    return isActive
      ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-200 shadow-sm'
      : 'bg-blue-50 text-blue-800 hover:bg-blue-100';
  }

  if (status === 'released') {
    return isActive
      ? 'bg-green-100 text-green-900 ring-1 ring-green-200 shadow-sm'
      : 'bg-green-50 text-green-800 hover:bg-green-100';
  }

  if (isActive) {
    return 'bg-background text-foreground ring-1 ring-border/70 shadow-sm';
  }

  return 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground';
}

function DocumentWorkStatusPills({
  filters,
  statusChips,
  totalDocumentCount,
  onFiltersChange,
  testIds,
}: Pick<
  DocumentWorkToolbarProps,
  | 'filters'
  | 'statusChips'
  | 'totalDocumentCount'
  | 'onFiltersChange'
  | 'testIds'
>) {
  return (
    <div
      className="overflow-x-auto no-scrollbar"
      data-testid={testIds?.statusChips ?? 'teacher-document-work-status-chips'}
      role="tablist"
      aria-label="Filter by status"
    >
      <div className="inline-flex w-max max-w-none flex-nowrap items-center gap-2">
        <button
          type="button"
          role="tab"
          aria-selected={filters.status === 'all'}
          onClick={() => onFiltersChange({ status: 'all' })}
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
            getStatusPillClasses(filters.status === 'all', 'all')
          )}
        >
          All
          <span className="tabular-nums text-xs opacity-80">{totalDocumentCount}</span>
        </button>
        {statusChips.map(({ status, count }) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filters.status === status}
            onClick={() => onFiltersChange({ status })}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              getStatusPillClasses(filters.status === status, status)
            )}
          >
            {TEACHER_DOCUMENT_STATUS_LABELS[status]}
            <span className="tabular-nums text-xs opacity-80">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DocumentWorkGroupSelect({
  filters,
  showClassFilter,
  testIds,
  onFiltersChange,
  triggerClassName,
}: Pick<
  DocumentWorkToolbarProps,
  'filters' | 'showClassFilter' | 'testIds' | 'onFiltersChange'
> & {
  triggerClassName?: string;
}) {
  return (
    <Select
      value={filters.group}
      onValueChange={(value) =>
        onFiltersChange({
          group: value as DocumentGroupMode,
        })
      }
    >
      <SelectTrigger
        className={cn('h-9 rounded-full bg-background', triggerClassName)}
        data-testid={
          testIds?.groupSelect ?? 'teacher-document-work-group-select'
        }
      >
        <SelectValue placeholder="List" />
      </SelectTrigger>
      <SelectContent>
        {DOCUMENT_WORK_GROUP_OPTIONS.filter(
          (option) => !option.showWhenClassFilter || showClassFilter
        ).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DocumentWorkRefinementFields({
  tableLabel,
  filters,
  searchValue,
  setSearchValue,
  students,
  classes,
  assignments,
  showClassFilter,
  onFiltersChange,
  layout,
}: Pick<
  DocumentWorkToolbarProps,
  | 'tableLabel'
  | 'filters'
  | 'searchValue'
  | 'setSearchValue'
  | 'students'
  | 'classes'
  | 'assignments'
  | 'showClassFilter'
  | 'onFiltersChange'
> & {
  layout: 'grid' | 'stack';
}) {
  const fieldClass =
    layout === 'grid' ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1.5';

  return (
    <div
      className={
        layout === 'grid'
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4'
          : 'flex flex-col gap-3'
      }
    >
      <div className={fieldClass}>
        <span className="text-xs font-medium text-muted-foreground">Search</span>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onFiltersChange({ query: searchValue.trim() });
          }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="document-work-search"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Students or documents"
            className="h-9 bg-background pl-9"
            aria-label={`Search ${tableLabel.toLowerCase()}`}
          />
        </form>
      </div>

      <div className={fieldClass}>
        <span className="text-xs font-medium text-muted-foreground">Student</span>
        <MultiSelect
          label="students"
          variant="field"
          emptySelectionLabel="All students"
          values={filters.studentIds}
          options={students.map((student) => ({
            value: student.id,
            label: student.label,
          }))}
          onChange={(studentIds) => onFiltersChange({ studentIds })}
        />
      </div>

      {showClassFilter ? (
        <div className={fieldClass}>
          <span className="text-xs font-medium text-muted-foreground">Class</span>
          <MultiSelect
            label="classes"
            variant="field"
            emptySelectionLabel="All classes"
            values={filters.classIds}
            options={classes!.map((klass) => ({
              value: klass.id,
              label: klass.label,
            }))}
            onChange={(classIds) => {
              const visibleAssignmentIds = new Set(
                (classIds.length > 0
                  ? assignments.filter((assignment) =>
                      assignmentMatchesClassFilters(assignment, classIds)
                    )
                  : assignments
                ).map((assignment) => assignment.id)
              );

              onFiltersChange({
                classIds,
                assignmentIds: filters.assignmentIds.filter((assignmentId) =>
                  visibleAssignmentIds.has(assignmentId)
                ),
              });
            }}
          />
        </div>
      ) : null}

      <div className={fieldClass}>
        <span className="text-xs font-medium text-muted-foreground">
          Assignment
        </span>
        <MultiSelect
          label="assignments"
          variant="field"
          emptySelectionLabel="All assignments"
          values={filters.assignmentIds}
          options={assignments.map((assignment) => ({
            value: assignment.id,
            label: assignment.label,
          }))}
          onChange={(assignmentIds) => onFiltersChange({ assignmentIds })}
        />
      </div>
    </div>
  );
}

function DocumentWorkToolbar(props: DocumentWorkToolbarProps) {
  const activeFilterCount = [
    props.filters.studentIds.length > 0,
    props.showClassFilter && props.filters.classIds.length > 0,
    props.filters.assignmentIds.length > 0,
    props.filters.query.trim().length > 0,
  ].filter(Boolean).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <DocumentWorkStatusPills {...props} />
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-2">
                <Filter className="h-4 w-4" />
                Filter
                {activeFilterCount > 0 ? (
                  <Badge variant="secondary" size="sm">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Filter results</p>
                  {props.hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={props.onClearFilters}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear all
                    </button>
                  ) : null}
                </div>
                <DocumentWorkRefinementFields {...props} layout="stack" />
              </div>
            </PopoverContent>
          </Popover>
          {props.headerActions}
          <DocumentWorkGroupSelect
            {...props}
            triggerClassName="w-[10.5rem]"
          />
        </div>
      </div>
    </section>
  );
}

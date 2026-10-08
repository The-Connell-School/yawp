import { Link, useNavigate } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  ArrowUp,
  ArrowDown,
  Users,
  TriangleAlert,
} from 'lucide-react';
import { Pagination } from '~/components/table/pagination';
import { formatUserDisplayName } from '~/utils/user-display';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
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
  countTeacherDocumentWorkStatuses,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import { serializeGradingQueueSort } from '~/domain/grading/grading-queue';
import {
  assignmentMatchesClassFilters,
  dedupeFilterOptionsById,
  studentMatchesStudentFilters,
} from '~/utils/teacher-document-work-filter-options';
import {
  type DocumentWorkSort,
  type DocumentWorkSortField,
  sortTeacherDocumentWorkRows,
  toggleDocumentWorkSort,
} from '~/utils/teacher-document-work-sort';
import { cn } from '~/utils/misc';
import { timeAgo } from '~/utils/timeAgo';

const DOCUMENT_TABLE_ROW_CLASSES = {
  // Auto layout sized to content, never narrower than its container: the
  // surrounding container scrolls horizontally when the columns do not fit
  // rather than squeezing every column down to the viewport width.
  table: 'w-max min-w-full text-sm',
  head: 'h-9 whitespace-nowrap px-2 py-1.5 text-sm',
  cell: 'whitespace-nowrap px-2 py-2 text-sm',
  // Free-text columns still get a ceiling so one long title cannot push the
  // row out to several screens' width; the full value stays in the title
  // attribute. Status and dates are never capped — they must read in full.
  textCell: 'max-w-[18rem] truncate',
  dateCell: 'text-sm text-muted-foreground',
  badgeSize: 'default' as const,
};

function compactHeadClassName(compactRows: boolean, extra?: string) {
  if (!compactRows) return extra;

  return cn(DOCUMENT_TABLE_ROW_CLASSES.head, extra);
}

export type TeacherDocumentWorkFilters = {
  studentIds: string[];
  classIds: string[];
  assignmentIds: string[];
  status: TeacherDocumentStatus | 'all';
  group: DocumentGroupMode;
  query: string;
};

export type TeacherDocumentWorkAction = {
  id: string;
  label: string;
  count?: number;
  onSelect: () => void;
  disabled?: boolean;
};

export type TeacherDocumentWorkSelection = {
  selectedDocumentIds: string[];
  onSelectedDocumentIdsChange: (documentIds: string[]) => void;
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
  exitTo: string;
  filters: TeacherDocumentWorkFilters;
  onFiltersChange: (updates: Partial<TeacherDocumentWorkFilters>) => void;
  onClearFilters: () => void;
  collapsedGroups: Set<string>;
  onCollapsedGroupsChange: (
    next: Set<string>,
    options?: { persist?: boolean }
  ) => void;
  headerActions?: React.ReactNode;
  actions?: TeacherDocumentWorkAction[];
  selection?: TeacherDocumentWorkSelection;
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
  clickableRows?: boolean;
  compactRows?: boolean;
  sort?: DocumentWorkSort;
  onSortChange?: (sort: DocumentWorkSort) => void;
};

export function TeacherDocumentWorkPanel({
  tableLabel,
  documents,
  statusCounts: _statusCounts,
  students,
  classes,
  assignments,
  assignmentsEnabled = true,
  exitTo,
  filters,
  onFiltersChange,
  onClearFilters,
  collapsedGroups,
  onCollapsedGroupsChange,
  headerActions,
  actions,
  selection,
  pagination,
  emptyMessageSecondary = 'Try clearing a filter or check another class.',
  testIds,
  collapseAllGroupsWhenGroupChanges = false,
  clickableRows = false,
  compactRows = false,
  sort,
  onSortChange,
}: TeacherDocumentWorkPanelProps) {
  const navigate = useNavigate();
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

  const documentsMatchingNonStatusFilters = useMemo(() => {
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

      if (!query) {
        return true;
      }

      const haystack = [
        document.title,
        document.assignment?.title,
        document.membership.user.name,
        document.membership.user.email,
        ...(document.group?.members.flatMap((member) => [
          member.membership.user.name,
          member.membership.user.email,
        ]) ?? []),
        document.latestSubmission?.title,
        document.resolvedClass
          ? formatClassLabel(document.resolvedClass)
          : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [documents, filters, uniqueStudents]);

  const filteredDocuments = useMemo(() => {
    if (filters.status === 'all') {
      return documentsMatchingNonStatusFilters;
    }

    return documentsMatchingNonStatusFilters.filter((document) => {
      const status = getTeacherDocumentWorkStatusDisplay(document).status;
      return status === filters.status;
    });
  }, [documentsMatchingNonStatusFilters, filters.status]);

  const effectiveStatusCounts = useMemo(
    () => countTeacherDocumentWorkStatuses(documentsMatchingNonStatusFilters),
    [documentsMatchingNonStatusFilters]
  );

  const sortedFilteredDocuments = useMemo(() => {
    if (!sort) return filteredDocuments;

    return sortTeacherDocumentWorkRows({
      documents: filteredDocuments,
      sort,
      collator,
    });
  }, [collator, filteredDocuments, sort]);

  const groups = useMemo(
    () =>
      buildTeacherDocumentWorkGroups({
        documents: sortedFilteredDocuments,
        mode: filters.group,
        collator,
      }),
    [collator, sortedFilteredDocuments, filters.group]
  );

  useEffect(() => {
    if (!collapseAllGroupsWhenGroupChanges) return;

    if (previousGroupModeRef.current === null) {
      previousGroupModeRef.current = filters.group;
      return;
    }

    if (previousGroupModeRef.current === filters.group) return;

    previousGroupModeRef.current = filters.group;

    if (filters.group === 'none') {
      onCollapsedGroupsChange(new Set(), { persist: false });
      return;
    }

    onCollapsedGroupsChange(collapsedGroupKeysForGroups(groups), {
      persist: false,
    });
  }, [
    collapseAllGroupsWhenGroupChanges,
    filters.group,
    groups,
    onCollapsedGroupsChange,
  ]);

  const documentsToRender =
    filters.group === 'none' && pagination
      ? sortedFilteredDocuments.slice(
          pagination.skip,
          pagination.skip + pagination.take
        )
      : sortedFilteredDocuments;

  const hasActiveFilters =
    filters.studentIds.length > 0 ||
    filters.classIds.length > 0 ||
    filters.assignmentIds.length > 0 ||
    filters.status !== 'all' ||
    filters.query.trim().length > 0;

  const statusChips = TEACHER_DOCUMENT_STATUSES.map((status) => ({
    status,
    count: effectiveStatusCounts[status],
  }));

  const selectedDocumentIdSet = useMemo(
    () => new Set(selection?.selectedDocumentIds ?? []),
    [selection?.selectedDocumentIds]
  );
  const selectedDocumentCount = selection?.selectedDocumentIds.length ?? 0;
  const selectableRowsEnabled = Boolean(selection);

  const setSelectedDocuments = (documentIds: string[]) => {
    selection?.onSelectedDocumentIdsChange(Array.from(new Set(documentIds)));
  };

  const toggleDocumentSelection = (documentId: string, checked: boolean) => {
    if (!selection) return;

    const next = new Set(selection.selectedDocumentIds);
    if (checked) {
      next.add(documentId);
    } else {
      next.delete(documentId);
    }

    setSelectedDocuments(Array.from(next));
  };

  const toggleRowSelectionGroup = (
    rows: TeacherDocumentWorkRow[],
    checked: boolean
  ) => {
    if (!selection) return;

    const next = new Set(selection.selectedDocumentIds);
    rows.forEach((document) => {
      if (checked) {
        next.add(document.id);
      } else {
        next.delete(document.id);
      }
    });

    setSelectedDocuments(Array.from(next));
  };

  const renderSortableHead = (
    label: string,
    field: DocumentWorkSortField,
    className?: string
  ) => {
    if (!sort || !onSortChange) {
      return <TableHead className={className}>{label}</TableHead>;
    }

    const isActive = sort.field === field;

    return (
      <TableHead className={className}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-1 h-auto min-h-8 gap-1 whitespace-normal px-1 py-1 text-left"
          aria-label={`Sort by ${label} ${
            isActive && sort.direction === 'asc' ? 'descending' : 'ascending'
          }`}
          onClick={() => onSortChange(toggleDocumentWorkSort(sort, field))}
        >
          {label}
          {isActive ? (
            sort.direction === 'asc' ? (
              <ArrowUp className="h-4 w-4" />
            ) : (
              <ArrowDown className="h-4 w-4" />
            )
          ) : null}
        </Button>
      </TableHead>
    );
  };

  const renderRows = (rows: TeacherDocumentWorkRow[]) =>
    rows.map((document) => {
      const status = getTeacherDocumentWorkStatusDisplay(document);
      const displayTitle =
        document.latestSubmission?.title?.trim() ||
        getDraftDisplayTitle(document);
      const latestSubmission = document.latestSubmission;
      const detailLink = getTeacherDocumentWorkDetailLink({
        document,
        exitTo,
        queueSort: sort ? serializeGradingQueueSort(sort) : null,
      });
      const rowClasses = compactRows ? DOCUMENT_TABLE_ROW_CLASSES : null;

      return (
        <TableRow
          key={document.id}
          className={cn(clickableRows && 'group cursor-pointer hover:bg-muted')}
          onClick={
            clickableRows
              ? () => {
                  navigate(detailLink);
                }
              : undefined
          }
          onKeyDown={
            clickableRows
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(detailLink);
                  }
                }
              : undefined
          }
          tabIndex={clickableRows ? 0 : undefined}
        >
          {selectableRowsEnabled ? (
            <TableCell
              className={cn(
                'w-10 pl-4 pr-1',
                rowClasses?.cell,
                !showStudentColumn && rowClasses?.textCell
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <SelectionCheckbox
                checked={selectedDocumentIdSet.has(document.id)}
                aria-label={`Select ${displayTitle}`}
                onCheckedChange={(checked) =>
                  toggleDocumentSelection(document.id, checked)
                }
              />
            </TableCell>
          ) : null}
          {showStudentColumn ? (
            <TableCell
              className={cn(
                selectableRowsEnabled ? 'font-medium' : 'pl-4 font-medium',
                rowClasses?.cell,
                rowClasses?.textCell
              )}
              title={formatUserDisplayName(document.membership.user)}
            >
              <span className="inline-flex items-center gap-1.5">
                {document.group ? (
                  <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                ) : null}
                {formatUserDisplayName(document.membership.user)}
              </span>
            </TableCell>
          ) : null}
          <TableCell
            className={cn(rowClasses?.cell, rowClasses?.textCell)}
            title={displayTitle}
          >
            {clickableRows ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 truncate group-hover:underline">
                  {displayTitle}
                </span>
                <ChevronRight
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                />
                {document.hasPasteActivity ? (
                  <TriangleAlert
                    className="size-3.5 shrink-0 text-red-600"
                    aria-label="Copy/paste activity recorded"
                    data-testid="document-paste-indicator"
                  />
                ) : null}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                {displayTitle}
                {document.hasPasteActivity ? (
                  <TriangleAlert
                    className="size-3.5 shrink-0 text-red-600"
                    aria-label="Copy/paste activity recorded"
                    data-testid="document-paste-indicator"
                  />
                ) : null}
              </span>
            )}
          </TableCell>
          {showClassColumn ? (
            <TableCell
              className={cn(
                'text-muted-foreground',
                rowClasses?.cell,
                rowClasses?.textCell
              )}
              title={
                document.resolvedClass
                  ? formatClassLabel(document.resolvedClass)
                  : undefined
              }
            >
              {document.resolvedClass
                ? formatClassLabel(document.resolvedClass)
                : '—'}
            </TableCell>
          ) : null}
          {showAssignmentColumn ? (
            <TableCell
              className={cn(
                'text-muted-foreground',
                rowClasses?.cell,
                rowClasses?.textCell
              )}
              title={document.assignment?.title || undefined}
            >
              {document.assignment?.title || '—'}
            </TableCell>
          ) : null}
          {showStatusColumn ? (
            <TableCell
              className={rowClasses?.cell}
              data-testid="document-status-cell"
            >
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="secondary"
                  size={rowClasses?.badgeSize}
                  className={cn(status.badgeClassName, 'whitespace-nowrap')}
                  title={status.label}
                >
                  {status.label}
                </Badge>
                {document.submissionCount >= 2 ? (
                  <span className="shrink-0 text-sm text-muted-foreground">
                    v{document.submissionCount}
                  </span>
                ) : null}
              </div>
            </TableCell>
          ) : null}
          <TableCell
            className={cn(
              'text-muted-foreground',
              rowClasses?.cell,
              rowClasses?.dateCell
            )}
          >
            {latestSubmission
              ? timeAgo(
                  new Date(
                    latestSubmission.submittedAt ??
                      latestSubmission.createdAt ??
                      document.updatedAt
                  )
                )
              : '—'}
          </TableCell>
          <TableCell
            className={cn(
              'text-muted-foreground',
              rowClasses?.cell,
              rowClasses?.dateCell
            )}
          >
            {latestSubmission?.gradedAt
              ? timeAgo(new Date(latestSubmission.gradedAt))
              : '—'}
          </TableCell>
          <TableCell
            className={cn(
              'text-muted-foreground',
              rowClasses?.cell,
              rowClasses?.dateCell,
              'pr-4'
            )}
          >
            {timeAgo(document.updatedAt)}
          </TableCell>
          {clickableRows ? null : (
            <TableCell className="pr-4">
              <Button asChild size="sm" variant="link" className="h-auto px-0">
                <Link to={detailLink}>View</Link>
              </Button>
            </TableCell>
          )}
        </TableRow>
      );
    });

  const renderDocumentsTable = (
    rows: TeacherDocumentWorkRow[],
    nested = false
  ) => {
    const selectedInRows = selection
      ? rows.filter((document) => selectedDocumentIdSet.has(document.id)).length
      : 0;
    const allRowsSelected = rows.length > 0 && selectedInRows === rows.length;
    const someRowsSelected = selectedInRows > 0 && !allRowsSelected;

    return (
      <Table
        aria-label={tableLabel}
        containerClassName={cn(
          // The columns can run wider than the viewport, so the horizontal
          // scrollbar has to be visible for the overflow to be discoverable.
          'show-scrollbar overflow-x-auto',
          nested && 'rounded-none border-0 shadow-none'
        )}
        className={cn(
          nested ? undefined : 'rounded-lg bg-muted/50',
          compactRows && DOCUMENT_TABLE_ROW_CLASSES.table
        )}
      >
        <TableHeader>
          <TableRow>
            {selectableRowsEnabled ? (
              <TableHead
                className={cn(
                  'w-10 pl-4 pr-1',
                  compactHeadClassName(compactRows)
                )}
              >
                <SelectionCheckbox
                  checked={allRowsSelected}
                  indeterminate={someRowsSelected}
                  aria-label={
                    allRowsSelected
                      ? 'Clear selected documents'
                      : 'Select visible documents'
                  }
                  onCheckedChange={(checked) =>
                    toggleRowSelectionGroup(rows, checked)
                  }
                />
              </TableHead>
            ) : null}
            {showStudentColumn
              ? renderSortableHead(
                  'Student',
                  'student',
                  compactHeadClassName(
                    compactRows,
                    selectableRowsEnabled ? undefined : 'pl-4'
                  )
                )
              : null}
            {renderSortableHead(
              'Document',
              'document',
              compactHeadClassName(compactRows)
            )}
            {showClassColumn
              ? renderSortableHead(
                  'Class',
                  'class',
                  compactHeadClassName(compactRows)
                )
              : null}
            {showAssignmentColumn
              ? renderSortableHead(
                  'Assignment',
                  'assignment',
                  compactHeadClassName(compactRows)
                )
              : null}
            {showStatusColumn
              ? renderSortableHead(
                  'Status',
                  'status',
                  compactHeadClassName(compactRows)
                )
              : null}
            {renderSortableHead(
              'Submitted at',
              'submittedAt',
              compactHeadClassName(compactRows)
            )}
            {renderSortableHead(
              'Graded at',
              'gradedAt',
              compactHeadClassName(compactRows)
            )}
            {renderSortableHead(
              'Last edited',
              'lastEdited',
              compactHeadClassName(compactRows)
            )}
            {clickableRows ? null : (
              <TableHead className="pr-4">Action</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>{renderRows(rows)}</TableBody>
      </Table>
    );
  };

  const toolbarProps: DocumentWorkToolbarProps = {
    tableLabel,
    filters,
    statusChips,
    totalDocumentCount: Object.values(effectiveStatusCounts).reduce(
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
    actions,
    selectedDocumentCount,
    onClearSelection: selection
      ? () => selection.onSelectedDocumentIdsChange([])
      : undefined,
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
  actions?: TeacherDocumentWorkAction[];
  selectedDocumentCount?: number;
  onClearSelection?: () => void;
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

const STATUS_DOT_CLASSES: Record<TeacherDocumentStatus, string> = {
  'in-progress': 'bg-zinc-500',
  'needs-grading': 'bg-amber-500',
  graded: 'bg-blue-600',
  released: 'bg-emerald-600',
};

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
  const testId = testIds?.statusChips ?? 'teacher-document-work-status-chips';

  const pillClass = (isActive: boolean) =>
    cn(
      'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm/5 font-medium sm:text-sm/5',
      isActive
        ? 'bg-popover text-foreground shadow-sm ring-1 ring-black/10'
        : 'text-foreground/80 hover:bg-popover/70 hover:text-foreground'
    );

  const countClass = (isActive: boolean) =>
    cn(
      'tabular-nums',
      isActive ? 'text-muted-foreground' : 'text-foreground/60'
    );

  return (
    <div
      className="overflow-x-auto no-scrollbar"
      data-testid={testId}
      role="tablist"
      aria-label="Filter by status"
    >
      <div className="inline-flex w-max max-w-none flex-nowrap items-center gap-0.5 rounded-full border border-border bg-secondary p-1 shadow-xs">
        <button
          type="button"
          role="tab"
          aria-selected={filters.status === 'all'}
          onClick={() => onFiltersChange({ status: 'all' })}
          className={pillClass(filters.status === 'all')}
        >
          All
          <span className={countClass(filters.status === 'all')}>
            {totalDocumentCount}
          </span>
        </button>
        {statusChips.map(({ status, count }) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={filters.status === status}
            onClick={() => onFiltersChange({ status })}
            className={pillClass(filters.status === status)}
          >
            <span
              className={cn(
                'size-2 shrink-0 rounded-full',
                STATUS_DOT_CLASSES[status]
              )}
              aria-hidden
            />
            {TEACHER_DOCUMENT_STATUS_LABELS[status]}
            <span className={countClass(filters.status === status)}>
              {count}
            </span>
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
>) {
  const searchField = (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Search</span>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onFiltersChange({ query: searchValue.trim() });
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="document-work-search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Students or documents"
          className="h-9 rounded-md border-0 bg-background pl-9 shadow-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Search ${tableLabel.toLowerCase()}`}
        />
      </form>
    </div>
  );

  const studentSelect = (
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
  );

  const classSelect = showClassFilter ? (
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
  ) : null;

  const assignmentSelect = (
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
  );

  return (
    <div className="flex flex-col gap-3">
      {searchField}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Student
          </span>
          {studentSelect}
        </div>
        {showClassFilter ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Class
            </span>
            {classSelect}
          </div>
        ) : null}
        <div
          className={cn(
            'flex flex-col gap-1.5',
            showClassFilter ? 'sm:col-span-2' : 'sm:col-span-1'
          )}
        >
          <span className="text-xs font-medium text-muted-foreground">
            Assignment
          </span>
          {assignmentSelect}
        </div>
      </div>
    </div>
  );
}

function FilterDropdownPanel({
  hasActiveFilters,
  onClearFilters,
  ...fieldsProps
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
  | 'hasActiveFilters'
  | 'onClearFilters'
>) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Filter results</p>
          <p className="text-xs text-muted-foreground">
            Narrow by student, class, or assignment
          </p>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        ) : null}
      </div>
      <div className="p-4">
        <DocumentWorkRefinementFields {...fieldsProps} />
      </div>
    </>
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
        <div className="min-w-0 lg:flex-1">
          <DocumentWorkStatusPills {...props} />
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <DocumentWorkActionsMenu actions={props.actions} />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2 rounded-full"
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
              <FilterDropdownPanel {...props} />
            </PopoverContent>
          </Popover>
          {props.headerActions}
          <DocumentWorkGroupSelect {...props} triggerClassName="w-[10.5rem]" />
        </div>
      </div>
      <DocumentWorkSelectionToolbar
        selectedDocumentCount={props.selectedDocumentCount}
        onClearSelection={props.onClearSelection}
      />
    </section>
  );
}

function DocumentWorkSelectionToolbar({
  selectedDocumentCount = 0,
  onClearSelection,
}: Pick<
  DocumentWorkToolbarProps,
  'selectedDocumentCount' | 'onClearSelection'
>) {
  const isVisible = selectedDocumentCount > 0;

  return (
    <div
      aria-hidden={!isVisible}
      className={cn(
        'fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 transition-all duration-200 ease-out',
        isVisible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-6 opacity-0'
      )}
      data-testid="teacher-document-work-selection-toolbar"
    >
      <div className="flex h-11 items-center gap-3 rounded-full border bg-background/95 px-4 text-sm shadow-lg ring-1 ring-black/5 backdrop-blur">
        <span className="font-medium tabular-nums text-foreground">
          {selectedDocumentCount} selected
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full px-3"
          disabled={!onClearSelection}
          onClick={onClearSelection}
        >
          Clear selection
        </Button>
      </div>
    </div>
  );
}

function DocumentWorkActionsMenu({
  actions,
}: {
  actions?: TeacherDocumentWorkAction[];
}) {
  if (!actions || actions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="h-9 gap-2 rounded-full"
          data-testid="teacher-document-work-actions"
        >
          Actions
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            disabled={action.disabled}
            onSelect={action.onSelect}
            className="gap-3"
          >
            <span>{action.label}</span>
            {typeof action.count === 'number' ? (
              <Badge variant="secondary" size="sm" className="ml-auto">
                {action.count}
              </Badge>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  onCheckedChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      checked={checked}
      className={cn(
        'size-4 rounded border-border text-primary accent-primary',
        props.className
      )}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onCheckedChange(event.currentTarget.checked)}
    />
  );
}

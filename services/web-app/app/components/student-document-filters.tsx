import { Filter } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { MultiSelect } from '~/components/multi-select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  visibleStudentAssignmentOptions,
  type StudentDocumentFilterOption,
  type StudentDocumentFilters,
} from '~/utils/student-document-filters';
import {
  STUDENT_DOCUMENT_STATUSES,
  STUDENT_DOCUMENT_STATUS_DOT_CLASSES,
  STUDENT_DOCUMENT_STATUS_LABELS,
  type StudentDocumentStatus,
} from '~/utils/student-document-status';
import { cn } from '~/utils/misc';

export type StudentDocumentFiltersBarProps = {
  filters: StudentDocumentFilters;
  statusCounts: Record<StudentDocumentStatus, number>;
  totalCount: number;
  classes: StudentDocumentFilterOption[];
  assignments: StudentDocumentFilterOption[];
  hasActiveFilters: boolean;
  onFiltersChange: (updates: Partial<StudentDocumentFilters>) => void;
  onClearFilters: () => void;
};

function StatusPills({
  filters,
  statusCounts,
  totalCount,
  onFiltersChange,
}: Pick<
  StudentDocumentFiltersBarProps,
  'filters' | 'statusCounts' | 'totalCount' | 'onFiltersChange'
>) {
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
      className="no-scrollbar overflow-x-auto"
      data-testid="my-documents-status-chips"
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
            {totalCount}
          </span>
        </button>
        {STUDENT_DOCUMENT_STATUSES.map((status) => (
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
                STUDENT_DOCUMENT_STATUS_DOT_CLASSES[status]
              )}
              aria-hidden
            />
            {STUDENT_DOCUMENT_STATUS_LABELS[status]}
            <span className={countClass(filters.status === status)}>
              {statusCounts[status]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterFields({
  filters,
  classes,
  assignments,
  onFiltersChange,
}: Pick<
  StudentDocumentFiltersBarProps,
  'filters' | 'classes' | 'assignments' | 'onFiltersChange'
>) {
  const visibleAssignments = visibleStudentAssignmentOptions(
    assignments,
    filters.classIds
  );

  return (
    <div className="flex flex-col gap-3">
      {classes.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Class
          </span>
          <MultiSelect
            label="classes"
            variant="field"
            emptySelectionLabel="All classes"
            values={filters.classIds}
            options={classes.map((klass) => ({
              value: klass.id,
              label: klass.label,
            }))}
            onChange={(classIds) => {
              // Narrowing the class narrows the assignment list, so drop any
              // assignment selection that is no longer pickable.
              const stillVisible = new Set(
                visibleStudentAssignmentOptions(assignments, classIds).map(
                  (assignment) => assignment.id
                )
              );

              onFiltersChange({
                classIds,
                assignmentIds: filters.assignmentIds.filter((assignmentId) =>
                  stillVisible.has(assignmentId)
                ),
              });
            }}
          />
        </div>
      ) : null}
      {assignments.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Assignment
          </span>
          <MultiSelect
            label="assignments"
            variant="field"
            emptySelectionLabel="All assignments"
            values={filters.assignmentIds}
            options={visibleAssignments.map((assignment) => ({
              value: assignment.id,
              label: assignment.label,
            }))}
            onChange={(assignmentIds) => onFiltersChange({ assignmentIds })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function StudentDocumentFiltersBar({
  filters,
  statusCounts,
  totalCount,
  classes,
  assignments,
  hasActiveFilters,
  onFiltersChange,
  onClearFilters,
}: StudentDocumentFiltersBarProps) {
  const activeFilterCount = [
    filters.classIds.length > 0,
    filters.assignmentIds.length > 0,
  ].filter(Boolean).length;

  return (
    <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 lg:flex-1">
        <StatusPills
          filters={filters}
          statusCounts={statusCounts}
          totalCount={totalCount}
          onFiltersChange={onFiltersChange}
        />
      </div>
      <div className="flex shrink-0 flex-nowrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-full"
              data-testid="my-documents-filter-trigger"
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
                  Narrow by class or assignment
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
              <FilterFields
                filters={filters}
                classes={classes}
                assignments={assignments}
                onFiltersChange={onFiltersChange}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}

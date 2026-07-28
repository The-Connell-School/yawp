import { useCallback, useEffect, useMemo, useState } from 'react';
import { Form } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { AssignmentCreationSheet } from '~/components/assignments/assignment-creation-sheet';
import {
  AssignmentEditSheet,
  type AssignmentEditRecord,
} from '~/components/assignments/assignment-edit-sheet';
import { badgeVariants } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Input } from '~/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { Pagination } from '~/components/table/pagination';
import { Tooltip } from '~/components/ui/tooltip';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';
import { useTable } from '~/hooks/useTable';
import { cn } from '~/utils/misc';
import { filterClassAssignmentsByQuery } from './class-assignments-search';

export type ClassAssignmentsTabAssignment = AssignmentEditRecord & {
  classAssignmentId: string;
  assignmentType: AssignmentEditRecord['assignmentType'] & {
    systemKey: string | null;
  };
  gradedCount: number;
  documentCount: number;
  otherClassCount: number;
};

type ClassAssignmentsTabProps = {
  classOption: { id: string; name: string };
  assignments: ClassAssignmentsTabAssignment[];
  assignmentTypes: { id: string; title: string }[];
  onViewDocuments: (assignmentId: string) => void;
};

function assignmentTitle(assignment: ClassAssignmentsTabAssignment) {
  return assignment.title?.trim() || 'Untitled Assignment';
}

export function clampAssignmentPaginationSkip(
  skip: number,
  take: number,
  totalCount: number
) {
  if (totalCount <= 0) return 0;
  const lastPageSkip = Math.floor((totalCount - 1) / take) * take;
  return Math.min(skip, lastPageSkip);
}

export function ClassAssignmentsTab({
  classOption,
  assignments,
  assignmentTypes,
  onViewDocuments,
}: ClassAssignmentsTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [pagination, setPagination] = useState({ skip: 0, take: 20 });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [duplicateAssignment, setDuplicateAssignment] =
    useState<ClassAssignmentsTabAssignment | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(
    null
  );

  const collator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }),
    []
  );
  const sortedAssignments = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...assignments].sort(
      (a, b) =>
        collator.compare(assignmentTitle(a), assignmentTitle(b)) * direction
    );
  }, [assignments, collator, sortDirection]);
  const filteredAssignments = useMemo(
    () => filterClassAssignmentsByQuery(sortedAssignments, searchQuery),
    [searchQuery, sortedAssignments]
  );
  const paginatedAssignments = filteredAssignments.slice(
    pagination.skip,
    pagination.skip + pagination.take
  );

  const {
    selected: selectedAssignmentIds,
    setSelected: setSelectedAssignmentIds,
    handleSelectAll,
    handleSelect,
  } = useTable({ rows: filteredAssignments });

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

  useEffect(() => {
    const visibleIds = new Set(filteredAssignments.map(({ id }) => id));
    setSelectedAssignmentIds((current) => {
      const next = current.filter((id) => visibleIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [filteredAssignments, setSelectedAssignmentIds]);

  const editingAssignment = useMemo(
    () =>
      assignments.find(
        (assignment) => assignment.id === editingAssignmentId
      ) ?? null,
    [assignments, editingAssignmentId]
  );
  const hasSelection = selectedAssignmentIds.length > 0;
  const handleCreateSheetOpenChange = useCallback((open: boolean) => {
    setIsCreateSheetOpen(open);
    if (!open) setDuplicateAssignment(null);
  }, []);

  return (
    <div className="space-y-4 text-foreground">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-0 w-full max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="class-assignments-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search assignments"
            className="h-9 rounded-md border-0 bg-background pl-9 shadow-none ring-1 ring-black/5 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Search assignments"
            data-testid="class-assignments-search"
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
              <input type="hidden" name="intent" value="delete-assignments" />
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
          ) : null}
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            data-testid="new-assignment-button"
            onClick={() => {
              setDuplicateAssignment(null);
              setIsCreateSheetOpen(true);
            }}
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
            Create the first assignment for this class
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
                <TableHead className="whitespace-nowrap">Type</TableHead>
                <TableHead className="whitespace-nowrap">Graded</TableHead>
                <TableHead className="whitespace-nowrap pr-4">
                  Documents
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedAssignments.map((assignment) => {
                const title = assignmentTitle(assignment);
                const canEdit =
                  assignment.assignmentType.systemKey !==
                  AP_HISTORY_ASSIGNMENT_TYPE_KEY;
                const rowActionsDisabled = hasSelection;

                return (
                  <TableRow
                    key={assignment.classAssignmentId}
                    data-state={
                      selectedAssignmentIds.includes(assignment.id)
                        ? 'selected'
                        : undefined
                    }
                  >
                    <TableCell className="max-h-[37px] pl-4">
                      <Checkbox
                        aria-label={`Select assignment ${title}`}
                        checked={selectedAssignmentIds.includes(assignment.id)}
                        onCheckedChange={() => handleSelect(assignment.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <button
                        type="button"
                        data-testid={`assignment-open-${assignment.id}`}
                        className={cn(
                          'text-left [overflow-wrap:anywhere]',
                          canEdit && !rowActionsDisabled
                            ? 'cursor-pointer hover:text-primary'
                            : 'cursor-default text-foreground'
                        )}
                        disabled={!canEdit || rowActionsDisabled}
                        onClick={() => setEditingAssignmentId(assignment.id)}
                      >
                        {title}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assignment.assignmentType.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {assignment.gradedCount}
                    </TableCell>
                    <TableCell className="pr-4">
                      <button
                        type="button"
                        className={cn(
                          badgeVariants({ variant: 'secondary' }),
                          'cursor-pointer gap-1 py-1 pl-2 pr-1'
                        )}
                        onClick={() => onViewDocuments(assignment.id)}
                        aria-label={`View documents for ${title}`}
                      >
                        {assignment.documentCount}{' '}
                        {assignment.documentCount === 1 ? 'doc' : 'docs'}
                        <ChevronRight
                          className="size-3 shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
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

      <AssignmentCreationSheet
        open={isCreateSheetOpen}
        onOpenChange={handleCreateSheetOpenChange}
        entryPoint="class"
        fixedClassId={classOption.id}
        assignmentTypes={assignmentTypes}
        teacherClasses={[classOption]}
        fixedAssignmentTypeId={duplicateAssignment?.assignmentTypeId}
        initialTitle={
          duplicateAssignment
            ? `Copy of ${assignmentTitle(duplicateAssignment)}`
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
          pdfClassId={classOption.id}
          allowedAssignmentTypes={assignmentTypes}
          editingAssignment={editingAssignment}
          onDuplicate={() => {
            setDuplicateAssignment(editingAssignment);
            setEditingAssignmentId(null);
            setIsCreateSheetOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}

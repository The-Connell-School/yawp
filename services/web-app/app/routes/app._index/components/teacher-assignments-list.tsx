import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatDateOnly } from '~/utils/date-only';
import type { TeacherAssignmentRow } from '../route';

function formatClassName(assignment: TeacherAssignmentRow) {
  return (
    assignment.class.title ||
    `Grade ${assignment.class.grade} • Period ${assignment.class.period}`
  );
}

export function TeacherAssignmentsList({
  assignments,
}: {
  assignments: TeacherAssignmentRow[];
}) {
  return (
    <div data-testid="teacher-assignments-list">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Assignments</h2>
        {assignments.length > 0 ? (
          <Badge variant="secondary" size="sm">
            {assignments.length}
          </Badge>
        ) : null}
      </div>

      {assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">No assignments yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Assignment Type</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="max-w-[220px] font-medium">
                    <div className="flex flex-col gap-1">
                      <span>
                        {assignment.title?.trim() || 'Untitled Assignment'}
                      </span>
                      <span className="line-clamp-1 text-xs font-normal text-muted-foreground">
                        {assignment.prompt}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{assignment.assignmentType.title}</TableCell>
                  <TableCell>{formatClassName(assignment)}</TableCell>
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
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        to={`/app/my-classes/${assignment.class.id}?tab=assignments`}
                      >
                        Open
                      </Link>
                    </Button>
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

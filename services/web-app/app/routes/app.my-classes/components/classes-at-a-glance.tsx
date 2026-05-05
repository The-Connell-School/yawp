import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import type { CourseGlanceRow } from '../route';

type StatusKey = keyof Omit<CourseGlanceRow, 'id' | 'name'>;

const COLUMNS: { key: StatusKey; label: string }[] = [
  { key: 'inProgress', label: 'In Progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'graded', label: 'Graded' },
  { key: 'released', label: 'Released' },
];

function StatusBadge({
  count,
  courseId,
  status,
}: {
  count: number;
  courseId: string;
  status: string;
}) {
  if (count === 0) {
    return (
      <Badge variant="secondary" size="sm" className="opacity-40 cursor-default select-none">
        0
      </Badge>
    );
  }
  return (
    <Link to={`/app/courses/${courseId}?status=${status}`}>
      <Badge
        variant="info-outlined"
        size="sm"
        className="cursor-pointer hover:opacity-80 transition-opacity"
      >
        {count}
      </Badge>
    </Link>
  );
}

export function ClassesAtAGlance({ courses }: { courses: CourseGlanceRow[] }) {
  if (courses.length === 0) {
    return (
      <div>
        <h2 className="text-base font-semibold mb-3">Classes at a Glance</h2>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground text-sm">
            No classes yet. Set up a course to see status here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Classes at a Glance</h2>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Class</TableHead>
              {COLUMNS.map((col) => (
                <TableHead key={col.key} className="text-center">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => (
              <TableRow key={course.id}>
                <TableCell className="font-medium text-sm">{course.name}</TableCell>
                {COLUMNS.map((col) => (
                  <TableCell key={col.key} className="text-center">
                    <StatusBadge
                      count={course[col.key]}
                      courseId={course.id}
                      status={col.key}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

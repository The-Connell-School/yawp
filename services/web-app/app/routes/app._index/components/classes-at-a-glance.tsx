import { Link } from 'react-router';
import { Badge } from '~/components/ui/badge';
import { cn } from '~/utils/misc';
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

const COLUMNS: { key: StatusKey; label: string; activeClassName: string }[] = [
  {
    key: 'inProgress',
    label: 'In Progress',
    activeClassName: 'border-yellow-300 bg-yellow-100 text-yellow-900 hover:bg-yellow-200',
  },
  {
    key: 'submitted',
    label: 'Submitted',
    activeClassName: 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100',
  },
  {
    key: 'graded',
    label: 'Graded',
    activeClassName: 'border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100',
  },
  {
    key: 'released',
    label: 'Released',
    activeClassName: 'border-green-300 bg-green-100 text-green-900 hover:bg-green-200',
  },
];

function StatusBadge({
  count,
  courseId,
  status,
  activeClassName,
}: {
  count: number;
  courseId: string;
  status: string;
  activeClassName: string;
}) {
  if (count === 0) {
    return (
      <Badge variant="secondary" size="sm" className="opacity-40 cursor-default select-none">
        0
      </Badge>
    );
  }
  return (
    <Link to={`/app/my-classes/${courseId}?status=${status}`}>
      <Badge
        size="sm"
        className={cn('cursor-pointer transition-opacity', activeClassName)}
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
                <TableCell className="font-medium text-sm">
                  <Link
                    to={`/app/my-classes/${course.id}`}
                    className="hover:underline"
                  >
                    {course.name}
                  </Link>
                </TableCell>
                {COLUMNS.map((col) => (
                  <TableCell key={col.key} className="text-center">
                    <StatusBadge
                      count={course[col.key]}
                      courseId={course.id}
                      status={col.key}
                      activeClassName={col.activeClassName}
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

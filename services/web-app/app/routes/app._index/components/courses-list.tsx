import { Link } from 'react-router';
import { ChevronRightIcon } from 'lucide-react';
import type { CourseRow } from '../route';

export function CoursesList({ courses }: { courses: CourseRow[] }) {
  if (courses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">
          No courses yet. Contact your admin to set up classes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border divide-y overflow-hidden">
      {courses.map((course) => (
        <Link
          key={course.id}
          to={`/app/courses/${course.id}`}
          className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div>
            <p className="font-medium text-sm">{course.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {course.studentCount} students
            </p>
          </div>
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

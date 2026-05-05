import { Link, useLoaderData } from 'react-router';
import { ArrowLeftIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import type { LoaderFunctionArgs } from 'react-router';
import { Button } from '~/components/ui/button';
import { CreateAssignmentForm } from './components/create-assignment-form';

export type AssignmentTypeCourseBreakdown = {
  id: string;
  name: string;
  inProgress: number;
  submitted: number;
  graded: number;
  released: number;
};

export type AssignmentTypeDetail = {
  id: string;
  name: string;
  courses: AssignmentTypeCourseBreakdown[];
};

export type CourseOption = {
  id: string;
  name: string;
};

// Prototype mock data — replace with real DB queries once assignments-unification schema lands
const MOCK_DETAIL: Record<string, AssignmentTypeDetail> = {
  at1: {
    id: 'at1',
    name: 'Thesis-Driven Essay',
    courses: [
      { id: 'c1', name: 'Period 1 English', inProgress: 12, submitted: 3, graded: 8, released: 5 },
      { id: 'c2', name: 'Period 3 English', inProgress: 16, submitted: 0, graded: 10, released: 6 },
      { id: 'c3', name: 'AP Lit', inProgress: 14, submitted: 2, graded: 4, released: 12 },
    ],
  },
  at2: {
    id: 'at2',
    name: 'Daily Pages',
    courses: [
      { id: 'c1', name: 'Period 1 English', inProgress: 8, submitted: 2, graded: 5, released: 3 },
      { id: 'c3', name: 'AP Lit', inProgress: 10, submitted: 1, graded: 2, released: 8 },
    ],
  },
  at3: {
    id: 'at3',
    name: 'Draft rubric',
    courses: [],
  },
};

const ALL_COURSES: CourseOption[] = [
  { id: 'c1', name: 'Period 1 English' },
  { id: 'c2', name: 'Period 3 English' },
  { id: 'c3', name: 'AP Lit' },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const detail: AssignmentTypeDetail = MOCK_DETAIL[params.assignmentTypeId!] ?? {
    id: params.assignmentTypeId!,
    name: 'Unknown',
    courses: [],
  };
  return { detail, allCourses: ALL_COURSES };
}

function formatCourseStats(course: AssignmentTypeCourseBreakdown): string {
  const parts: string[] = [];
  if (course.inProgress > 0) parts.push(`${course.inProgress} in progress`);
  if (course.submitted > 0) parts.push(`${course.submitted} submitted`);
  if (course.graded > 0) parts.push(`${course.graded} graded`);
  if (course.released > 0) parts.push(`${course.released} released`);
  return parts.join(' · ') || 'No assignments yet';
}

export default function AssignmentTypeDetailRoute() {
  const { detail, allCourses } = useLoaderData<typeof loader>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link to="/app">
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-xl font-semibold">{detail.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/my-classes/${detail.id}/edit`}>
              <PencilIcon className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Link>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            Create Assignment
          </Button>
        </div>
      </div>
      <div className="p-6 max-w-2xl">
        {detail.courses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground text-sm mb-4">
              This assignment type hasn&apos;t been assigned to any classes yet.
            </p>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              Create Assignment
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border divide-y overflow-hidden">
            {detail.courses.map((course) => (
              <div key={course.id} className="px-4 py-3">
                <p className="font-medium text-sm">{course.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCourseStats(course)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <CreateAssignmentForm
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        assignmentTypeName={detail.name}
        assignmentTypeId={detail.id}
        courses={allCourses}
      />
    </div>
  );
}

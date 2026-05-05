import { useLoaderData } from 'react-router';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { AssignmentTypesList } from './components/assignment-types-list';
import { ClassesAtAGlance } from './components/classes-at-a-glance';
import { CoursesList } from './components/courses-list';
import { TrainingList } from './components/training-list';

export type AssignmentTypeRow = {
  id: string;
  name: string;
  courseCount: number;
  studentCount: number;
  isOrphan: boolean;
};

export type CourseGlanceRow = {
  id: string;
  name: string;
  inProgress: number;
  submitted: number;
  graded: number;
  released: number;
};

export type CourseRow = {
  id: string;
  name: string;
  studentCount: number;
};

export type TrainingRow = {
  id: string;
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
};

// Prototype mock data — replace with real DB queries once assignments-unification schema lands
export async function loader() {
  const assignmentTypes: AssignmentTypeRow[] = [
    { id: 'at1', name: 'Thesis-Driven Essay', courseCount: 3, studentCount: 47, isOrphan: false },
    { id: 'at2', name: 'Daily Pages', courseCount: 2, studentCount: 30, isOrphan: false },
    { id: 'at3', name: 'Draft rubric', courseCount: 0, studentCount: 0, isOrphan: true },
  ];

  const coursesGlance: CourseGlanceRow[] = [
    { id: 'c1', name: 'Period 1 English', inProgress: 12, submitted: 3, graded: 8, released: 5 },
    { id: 'c2', name: 'Period 3 English', inProgress: 16, submitted: 0, graded: 10, released: 6 },
    { id: 'c3', name: 'AP Lit', inProgress: 14, submitted: 2, graded: 4, released: 12 },
  ];

  const courses: CourseRow[] = [
    { id: 'c1', name: 'Period 1 English', studentCount: 28 },
    { id: 'c2', name: 'Period 3 English', studentCount: 31 },
    { id: 'c3', name: 'AP Lit', studentCount: 24 },
  ];

  const training: TrainingRow[] = [
    { id: 'tr1', name: 'Getting Started with Yawp', status: 'completed' },
    { id: 'tr2', name: 'Advanced Feedback Techniques', status: 'in-progress' },
  ];

  return { assignmentTypes, coursesGlance, courses, training };
}

export default function MyClassesRoute() {
  const { assignmentTypes, coursesGlance, courses, training } =
    useLoaderData<typeof loader>();

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">My Classes</h1>
      </div>
      <div className="flex flex-col gap-8 p-6 max-w-4xl">
        <AssignmentTypesList assignmentTypes={assignmentTypes} />
        <ClassesAtAGlance courses={coursesGlance} />
        <Tabs defaultValue="courses">
          <TabsList>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
          </TabsList>
          <TabsContent value="courses" className="mt-4">
            <CoursesList courses={courses} />
          </TabsContent>
          <TabsContent value="training" className="mt-4">
            <TrainingList training={training} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

import {
  type LoaderFunctionArgs,
  data as dataResponse,
  useLoaderData,
  useNavigate,
} from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'TEACHER') {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const assignmentCounts = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

  const teacherTrainings = await prisma.teacherTraining.findMany({
    where: hasAssignedCourses
      ? { assignedTeachers: { some: { id: profile.id } } }
      : undefined,
    include: {
      teacherTrainingModules: {
        include: {
          resources: {
            select: {
              id: true,
              name: true,
              contentType: true,
            },
          },
        },
      },
      resources: {
        select: {
          id: true,
        },
      },
      image: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return dataResponse({ teacherTrainings });
}

export default function TeacherTrainingsRoute() {
  const { teacherTrainings } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col">
            <h2>Teacher's Lounge</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[400px]">
              Enjoy your courses and resources.
            </p>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            {teacherTrainings.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center border border-dashed bg-muted py-6">
                <span className="text-lg font-bold">No courses found</span>
                <span className="text-sm text-muted-foreground">
                  No courses are currently available
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {teacherTrainings.map((course) => (
                  <Card
                    key={course.id}
                    className="bg-muted cursor-pointer transition-shadow hover:shadow-lg"
                    onClick={() =>
                      navigate(`/app/teacher-trainings/${course.id}`)
                    }
                  >
                    <div className="aspect-video w-full overflow-hidden rounded-t-lg">
                      {course.image ? (
                        <img
                          src={`/api/image/teacher-training/${course.image.id}`}
                          alt={course.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-foreground/5 to-foreground/20" />
                      )}
                    </div>
                    <CardHeader>
                      <CardTitle className="line-clamp-1">
                        {course.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {course.description || 'No description'}
                      </p>
                      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          {course.teacherTrainingModules.length} modules
                        </span>
                        <span>{course.resources.length} resources</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

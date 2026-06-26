import {
  type LoaderFunctionArgs,
  data as dataResponse,
  useLoaderData,
} from 'react-router';
import { Link } from 'react-router';
import { ChevronLeft, Play, Clock, FileText } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { CircularProgress } from '~/components/ui/circular-progress';
import { prisma } from '~/utils/db.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { cn } from '~/utils/misc';
import {
  getTeacherTrainingProgressPercent,
  isTeacherTrainingModuleComplete,
} from '~/utils/teacher-training-progress';
import { useMemo } from 'react';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== "TEACHER") {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const assignmentCounts = await prisma.orgMembership.findUnique({
    where: { id: profile.id, role: 'TEACHER' },
    select: { _count: { select: { assignedTeacherTrainings: true } } },
  });
  const hasAssignedCourses =
    (assignmentCounts?._count.assignedTeacherTrainings ?? 0) > 0;

  const teacherTraining = await prisma.teacherTraining.findFirst({
    where: {
      id: params.id,
      ...(hasAssignedCourses
        ? { assignedTeachers: { some: { id: profile.id } } }
        : {}),
    },
    include: {
      image: { select: { id: true } },
      teacherTrainingModules: {
        include: {
          resources: {
            select: {
              id: true,
              name: true,
              contentType: true,
            },
          },
          teacherTrainingModuleSessions: {
            where: {
              membershipId: profile.id,
            },
            select: {
              id: true,
              videoTimestamp: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!teacherTraining) {
    throw new Response('Teacher training not found', { status: 404 });
  }

  return dataResponse({ teacherTraining });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Duration unknown';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

export default function TeacherTrainingRoute() {
  const { teacherTraining } = useLoaderData<typeof loader>();

  const totalModules = teacherTraining.teacherTrainingModules.length;
  const completedModules = teacherTraining.teacherTrainingModules.filter(
    (mod) =>
      mod.teacherTrainingModuleSessions.some((session) =>
        isTeacherTrainingModuleComplete(
          session.videoTimestamp,
          mod.videoDuration
        )
      )
  ).length;

  const totalCourseProgressPct = Math.ceil(
    totalModules > 0 ? (completedModules / totalModules) * 100 : 0
  );

  const totalCourseDuration = teacherTraining.teacherTrainingModules.reduce(
    (sum, module) => sum + (module.videoDuration || 0),
    0
  );

  const nextAction = useMemo(() => {
    const inProgressModule = teacherTraining.teacherTrainingModules.find(
      (module) => {
        const session = module.teacherTrainingModuleSessions[0];
        if (!session) return true;
        return session.videoTimestamp !== (module.videoDuration ?? 0);
      }
    );

    if (inProgressModule) {
      return {
        module: inProgressModule,
        type: 'continue' as const,
        session: inProgressModule.teacherTrainingModuleSessions[0],
      };
    }

    const nextModule = teacherTraining.teacherTrainingModules.find(
      (module) =>
        !module.teacherTrainingModuleSessions.length ||
        module.teacherTrainingModuleSessions.some(
          (session) => session.videoTimestamp !== (module.videoDuration ?? 0)
        )
    );

    return nextModule
      ? {
          module: nextModule,
          type: 'start' as const,
          session: null,
        }
      : null;
  }, []);

  return (
    <div className="min-h-screen bg-background max-w-4xl mx-auto h-full overflow-scroll">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Button variant="outline" asChild>
              <Link to="/app">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-col lg:flex-row lg:items-start lg:gap-8">
            {/* Course Image */}
            <div className="w-full lg:w-80 xl:w-96">
              <div className="aspect-video h-full w-full overflow-hidden rounded-lg border">
                {teacherTraining.image ? (
                  <img
                    src={`/api/image/teacher-training/${teacherTraining.image.id}`}
                    alt={teacherTraining.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-foreground/5 to-foreground/20 flex items-center justify-center">
                    <Play className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* Course Info */}
            <div className="mt-6 flex-1 lg:mt-0">
              <div className="flex justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-bold text-foreground">
                    {teacherTraining.title}
                  </h1>

                  {teacherTraining.description && (
                    <p className="mt-2 text-muted-foreground">
                      {teacherTraining.description}
                    </p>
                  )}
                </div>
                <div className="mt-6 flex flex-col gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 min-w-fit opacity-50" />
                    <span className="min-w-fit font-medium">
                      {totalModules} modules
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 min-w-fit opacity-50" />
                    <span className="min-w-fit font-medium">
                      {formatDuration(totalCourseDuration)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span
                    className={cn(
                      'font-medium',
                      totalCourseProgressPct === 100 && 'text-green-600'
                    )}
                  >
                    {totalCourseProgressPct}% Complete
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className={cn(
                      'bg-primary h-3 rounded-full transition-all duration-500',
                      totalCourseProgressPct === 100 && 'bg-green-600'
                    )}
                    style={{ width: `${totalCourseProgressPct}%` }}
                  />
                </div>
              </div>

              {/* Quick Action - Continue Where Left Off */}
              {nextAction && (
                <div className="mt-6">
                  <Button asChild className="w-full" size="lg">
                    <Link
                      to={`/app/teacher-trainings/${teacherTraining.id}/modules/${nextAction.module.id}`}
                    >
                      <Play className="mr-2 h-5 w-5" />
                      {nextAction.type === 'continue' && nextAction.session
                        ? `Continue "${nextAction.module.title}" (${Math.round((nextAction.session?.videoTimestamp / (nextAction.module.videoDuration || 0)) * 100)}% watched)`
                        : `Start "${nextAction.module.title}"`}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Course Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Modules List */}
          <div className="lg:col-span-2 space-y-2">
            {teacherTraining.teacherTrainingModules.map((module, index) => {
              const session = module.teacherTrainingModuleSessions[0];
              const progressPct = getTeacherTrainingProgressPercent(
                session?.videoTimestamp,
                module.videoDuration
              );

              return (
                <Link
                  key={module.id}
                  to={`/app/teacher-trainings/${teacherTraining.id}/modules/${module.id}`}
                  className="group block"
                >
                  <div className="flex bg-muted shadow-sm items-center gap-4 rounded-lg border p-4 transition-all hover:bg-muted/50 hover:shadow-sm">
                    {/* Circular Progress Indicator */}
                    <div className="flex-shrink-0">
                      <CircularProgress
                        progress={progressPct}
                        index={index + 1}
                        size="md"
                      />
                    </div>

                    {/* Module Info */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className={cn(
                          'font-medium text-foreground group-hover:text-primary transition-colors',
                          progressPct === 100 &&
                            'group-hover:text-green-600 text-green-600'
                        )}
                      >
                        {module.title}
                      </h3>
                      {module.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                          {module.description}
                        </p>
                      )}

                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        {module.videoDuration && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDuration(module.videoDuration)}
                          </span>
                        )}
                        {module.resources.length > 0 && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {module.resources.length} resource
                            {module.resources.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {session && session.videoTimestamp > 0 && (
                          <span
                            className={cn(
                              'text-primary font-medium',
                              progressPct === 100 && 'text-green-600'
                            )}
                          >
                            {progressPct}% watched
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}

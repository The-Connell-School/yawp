import {
  type LoaderFunctionArgs,
  data as dataResponse,
  useLoaderData,
} from 'react-router';
import { Link } from 'react-router';
import { ChevronLeft, Play, CheckCircle, Clock, FileText } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Badge } from '~/components/ui/badge';
import { CircularProgress } from '~/components/ui/circular-progress';
import { prisma } from '~/utils/db.server';
import { requireUserId } from '~/utils/auth.server';
import { cn } from '~/utils/misc';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Get teacher profile
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { teacherProfile: { select: { id: true } } },
  });

  if (!user?.teacherProfile) {
    throw new Response('Teacher profile required', { status: 403 });
  }

  const teacherCourse = await prisma.teacherCourse.findUnique({
    where: { id: params.id },
    include: {
      image: { select: { id: true } },
      teacherCourseModules: {
        include: {
          resources: {
            select: {
              id: true,
              name: true,
              contentType: true,
            },
          },
          teacherCourseModuleSessions: {
            where: {
              teacherProfileId: user.teacherProfile.id,
            },
            select: {
              id: true,
              videoProgress: true,
              videoTimestamp: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
    },
  });

  if (!teacherCourse) {
    throw new Response('Teacher course not found', { status: 404 });
  }

  return dataResponse({
    teacherCourse,
    teacherProfileId: user.teacherProfile.id,
  });
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

function getModuleStatus(session: any) {
  if (!session || session.length === 0) {
    return {
      status: 'not-started',
      icon: Clock,
      color: 'text-muted-foreground',
    };
  }

  const progress = session[0].videoProgress;
  if (progress >= 95) {
    return { status: 'completed', icon: CheckCircle, color: 'text-green-600' };
  } else if (progress > 0) {
    return { status: 'in-progress', icon: Play, color: 'text-blue-600' };
  } else {
    return {
      status: 'not-started',
      icon: Clock,
      color: 'text-muted-foreground',
    };
  }
}

export default function TeacherCourseRoute() {
  const { teacherCourse, teacherProfileId } = useLoaderData<typeof loader>();

  // Calculate overall progress
  const totalModules = teacherCourse.teacherCourseModules.length;
  const completedModules = teacherCourse.teacherCourseModules.filter((module) =>
    module.teacherCourseModuleSessions.some(
      (session) => session.videoProgress >= 95
    )
  ).length;
  const progressPercentage =
    totalModules > 0 ? (completedModules / totalModules) * 100 : 0;

  // Calculate total duration
  const totalDuration = teacherCourse.teacherCourseModules.reduce(
    (sum, module) => sum + (module.videoDuration || 0),
    0
  );

  // Find next module to continue from where user left off
  const getNextModule = () => {
    // First, find any in-progress module
    const inProgressModule = teacherCourse.teacherCourseModules.find(
      (module) => {
        const session = module.teacherCourseModuleSessions[0];
        return (
          session && session.videoProgress > 0 && session.videoProgress < 95
        );
      }
    );

    if (inProgressModule) {
      return {
        module: inProgressModule,
        type: 'continue' as const,
        session: inProgressModule.teacherCourseModuleSessions[0],
      };
    }

    // Otherwise, find first incomplete module
    const nextModule = teacherCourse.teacherCourseModules.find(
      (module) =>
        !module.teacherCourseModuleSessions.some(
          (session) => session.videoProgress >= 95
        )
    );

    return nextModule
      ? {
          module: nextModule,
          type: 'start' as const,
          session: null,
        }
      : null;
  };

  const nextAction = getNextModule();

  return (
    <div className="min-h-screen bg-background max-w-4xl mx-auto">
      {/* Header */}
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
              <div className="aspect-video w-full overflow-hidden rounded-lg border">
                {teacherCourse.image ? (
                  <img
                    src={`/api/image/teacher-course/${teacherCourse.image.id}`}
                    alt={teacherCourse.title}
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
              <h1 className="text-3xl font-bold text-foreground">
                {teacherCourse.title}
              </h1>

              {teacherCourse.description && (
                <p className="mt-4 text-lg text-muted-foreground">
                  {teacherCourse.description}
                </p>
              )}

              <div className="mt-6 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  <span>{totalModules} modules</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{formatDuration(totalDuration)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>{completedModules} completed</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-6">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-medium">Course Progress</span>
                  <span
                    className={cn(
                      'font-medium',
                      progressPercentage === 100 && 'text-green-600'
                    )}
                  >
                    {Math.ceil(progressPercentage)}% Complete
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className={cn(
                      'bg-primary h-3 rounded-full transition-all duration-500',
                      progressPercentage === 100 && 'bg-green-600'
                    )}
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Quick Action - Continue Where Left Off */}
              {nextAction && (
                <div className="mt-6">
                  <Button asChild className="w-full" size="lg">
                    <Link
                      to={`/app/teacher-courses/${teacherCourse.id}/modules/${nextAction.module.id}`}
                    >
                      <Play className="mr-2 h-5 w-5" />
                      {nextAction.type === 'continue'
                        ? `Continue "${nextAction.module.title}" (${Math.round(nextAction.session!.videoProgress)}% watched)`
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
            {teacherCourse.teacherCourseModules.map((module, index) => {
              const session = module.teacherCourseModuleSessions[0];

              return (
                <Link
                  key={module.id}
                  to={`/app/teacher-courses/${teacherCourse.id}/modules/${module.id}`}
                  className="group block"
                >
                  <div className="flex bg-muted shadow-sm items-center gap-4 rounded-lg border p-4 transition-all hover:bg-muted/50 hover:shadow-sm">
                    {/* Circular Progress Indicator */}
                    <div className="flex-shrink-0">
                      <CircularProgress
                        progress={session?.videoProgress || 0}
                        index={index + 1}
                        size="md"
                      />
                    </div>

                    {/* Module Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors">
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
                        {session && session.videoProgress > 0 && (
                          <span className="text-primary font-medium">
                            {Math.ceil(session.videoProgress)}% watched
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

import { Skeleton } from '~/components/ui/skeleton';

export function TeachingAccessLessonPlannerSkeleton() {
  return (
    <section
      data-testid="teaching-access-lesson-planner-skeleton"
      aria-busy="true"
      aria-label="Loading Lesson Planner"
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="border-b bg-secondary px-4 py-3 sm:px-8">
        <Skeleton className="mx-auto h-8 w-48 max-w-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center px-4 py-8 sm:px-12">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
        <Skeleton className="mt-8 h-32 w-full max-w-2xl rounded-xl" />
        <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      </div>
    </section>
  );
}

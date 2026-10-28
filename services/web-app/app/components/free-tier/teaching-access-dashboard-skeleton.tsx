import { Skeleton } from '~/components/ui/skeleton';

export function TeachingAccessDashboardSkeleton() {
  return (
    <section
      data-testid="teaching-access-dashboard-skeleton"
      aria-busy="true"
      aria-label="Loading your classroom"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="locked-home-b2 free-dashboard w-full pb-24">
        <Skeleton className="h-8 w-48" />
        <div className="locked-home-columns">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
          <div className="locked-home-rail-desktop">
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-56 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

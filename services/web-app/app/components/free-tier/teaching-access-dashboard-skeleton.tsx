import { Skeleton } from '~/components/ui/skeleton';

export function TeachingAccessDashboardSkeleton() {
  return (
    <section
      data-testid="teaching-access-dashboard-skeleton"
      aria-busy="true"
      aria-label="Loading your classroom"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        </div>
      </div>
      <div className="free-dashboard grid w-full max-w-[1136px] items-start gap-7 px-5 py-6 pb-24 sm:px-12 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
        <Skeleton className="hidden h-64 rounded-xl lg:block" />
      </div>
    </section>
  );
}

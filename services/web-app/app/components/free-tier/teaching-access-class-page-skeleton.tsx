import { Skeleton } from '~/components/ui/skeleton';

export function TeachingAccessClassPageSkeleton() {
  return (
    <section
      data-testid="teaching-access-class-page-skeleton"
      aria-busy="true"
      aria-label="Loading your class"
      className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll"
    >
      <div className="mx-auto w-full max-w-screen-xl px-3 py-3 pb-24 sm:px-5">
        <Skeleton className="mb-4 h-8 w-40" />
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-black/10">
          <div className="flex gap-4 p-4 sm:p-5">
            <Skeleton className="size-16 shrink-0 rounded-lg sm:size-20" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-7 w-2/3 max-w-sm" />
              <Skeleton className="h-4 w-1/2 max-w-xs" />
              <Skeleton className="h-4 w-1/3 max-w-[8rem]" />
            </div>
          </div>
          <div className="border-t border-border/60 p-2">
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </section>
  );
}

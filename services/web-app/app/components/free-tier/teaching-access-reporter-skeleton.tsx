import { Skeleton } from '~/components/ui/skeleton';

export function TeachingAccessReporterSkeleton() {
  return (
    <section
      data-testid="teaching-access-reporter-skeleton"
      aria-busy="true"
      aria-label="Loading Reporter"
      className="flex h-full flex-col overflow-auto"
    >
      <header className="bg-secondary px-4 py-6 sm:px-12">
        <Skeleton className="h-8 w-32" />
      </header>
      <div className="px-4 pb-12 pt-6 sm:px-12">
        <div className="max-w-[616px] rounded-xl border bg-popover p-7 shadow-sm">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="mt-4 h-6 w-3/4" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <Skeleton className="mt-6 h-10 w-28 rounded-full" />
        </div>
      </div>
    </section>
  );
}

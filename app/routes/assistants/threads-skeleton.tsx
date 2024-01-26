import { Skeleton } from '#app/components/ui/skeleton'

export const ThreadsSkeleton = () => (
	<div className="grid gap-1">
		<Skeleton className="h-[32px] w-full rounded" />
		<Skeleton className="h-[32px] w-full rounded" />
		<Skeleton className="h-[32px] w-full rounded" />
		<Skeleton className="h-[32px] w-full rounded" />
		<Skeleton className="h-[32px] w-full rounded" />
	</div>
)

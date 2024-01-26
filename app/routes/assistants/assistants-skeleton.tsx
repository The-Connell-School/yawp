import { Skeleton } from '#app/components/ui/skeleton'

export const AssistantsSkeleton = () => (
	<div className="grid gap-1">
		<Skeleton className="mx-2 h-[32px] w-[70%] rounded" />
		<Skeleton className="mx-2 h-[32px] w-[70%] rounded" />
		<Skeleton className="mx-2 h-[32px] w-[70%] rounded" />
	</div>
)

import { Link, Outlet, useMatches } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { SlashIcon } from '#app/components/icons'
import { button } from '#app/components/ui/button'
import {
	BreadcrumbHandleMatch,
	type BreadcrumbHandle,
} from '#app/utils/breadcrumb'
import { cn } from '#app/utils/misc'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/app/profile"
			className={button({ variant: 'ghost', size: 'sm' })}
		>
			Profile
		</Link>
	),
}

export default function Route() {
	const matches = useMatches()
	const breadcrumbs = matches
		.map(m => {
			const result = BreadcrumbHandleMatch.safeParse(m)
			if (!result.success || !result.data.handle.breadcrumb) return null
			if (typeof result.data.handle.breadcrumb !== 'string')
				return result.data.handle.breadcrumb
			return (
				<Link
					key={m.id}
					to={m.pathname}
					className={button({ variant: 'ghost', size: 'sm' })}
				>
					{result.data.handle.breadcrumb}
				</Link>
			)
		})
		.filter(Boolean)

	return (
		<div className="flex flex-col pb-12 pt-20 sm:pt-0">
			<ul className="hidden items-center p-2 sm:flex md:p-6">
				{breadcrumbs.map((breadcrumb, i, arr) => (
					<li
						key={i}
						className={cn('flex items-center', {
							'text-muted-foreground': i < arr.length - 1,
						})}
					>
						{i !== 0 ? <SlashIcon /> : null} {breadcrumb}
					</li>
				))}
			</ul>
			<div className="p-4 md:p-6">
				<Outlet />
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

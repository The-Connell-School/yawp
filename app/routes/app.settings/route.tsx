import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, Outlet } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

const tabs = [
	{ label: 'Courses', to: '/app/settings/courses' },
	{ label: 'Teachers', to: '/app/settings/teachers' },
]

export const handle: BreadcrumbHandle = {
	breadcrumb: 'Settings',
}

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	return json({})
}

export default function Route() {
	return (
		<main className="flex h-screen flex-col overflow-hidden">
			<nav className="flex items-end border-b bg-background px-3 pt-3">
				{tabs.map(tab => (
					<NavLink
						key={tab.to}
						to={tab.to}
						className={({ isActive }) =>
							cn(
								'mr-8 border-b border-b-transparent pb-2 text-muted-foreground',
								{
									'border-b-foreground font-semibold text-foreground': isActive,
								},
							)
						}
					>
						{tab.label}
					</NavLink>
				))}
			</nav>
			<Outlet />
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

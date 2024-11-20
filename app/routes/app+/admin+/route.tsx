import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, Outlet } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

const tabs = [
	{ label: 'General', to: '/app/admin/general' },
	{ label: 'Courses', to: '/app/admin/courses' },
	{ label: 'Teachers', to: '/app/admin/teachers' },
	{ label: 'Features', to: '/app/admin/feature-flags' },
]

export const handle: BreadcrumbHandle = { breadcrumb: 'Admin' }

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	return json({})
}

export default function Route() {
	return (
		<main className="flex h-screen">
			<div className="flex w-48 flex-col bg-background py-3">
				{tabs.map(tab => (
					<NavLink
						key={tab.to}
						to={tab.to}
						className={({ isActive }) =>
							cn('px-3 py-2 text-muted-foreground', {
								'font-semibold text-foreground': isActive,
							})
						}
					>
						{tab.label}
					</NavLink>
				))}
			</div>
			<div className="flex-grow overflow-auto">
				<Outlet />
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

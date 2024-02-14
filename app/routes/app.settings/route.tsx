import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { NavLink, Outlet } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

const tabs = [
	{ label: 'Teachers', to: '/app/settings/teachers' },
	{ label: 'Students', to: '/app/settings/students' },
	{ label: 'Modules', to: '/app/settings/modules' },
	{ label: 'Tutors', to: '/app/settings/tutors' },
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
		<main className="relative h-full overflow-y-scroll pt-[108px] sm:pt-[53px]">
			<nav className="fixed left-0 right-0 top-[55px] flex items-end border-b px-6 pt-4 sm:top-0">
				{tabs.map(tab => (
					<NavLink
						key={tab.to}
						to={tab.to}
						className={({ isActive }) =>
							cn(
								'mr-8 border-b border-b-transparent pb-3 text-muted-foreground',
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

import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Outlet, useLocation } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Tabs, TabsList, TabsTrigger } from '#app/components/ui/tabs'
import { type BreadcrumbHandle } from '#app/utils/breadcrumb'

const tabs = [{ label: 'Students', to: '/app/data/students' }]

export const handle: BreadcrumbHandle = { breadcrumb: 'Data' }

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url)
	if (url.pathname === '/app/data') {
		return redirect('/app/data/students')
	}
	return null
}

export default function Route() {
	const location = useLocation()
	const currentTab =
		tabs.find(tab => location.pathname.startsWith(tab.to))?.to || tabs[0].to

	return (
		<main className="flex h-screen flex-col overflow-hidden">
			<div className="flex-grow overflow-auto p-4">
				<Tabs value={currentTab}>
					<TabsList>
						{tabs.map(tab => (
							<TabsTrigger key={tab.to} value={tab.to} asChild>
								<a href={tab.to}>{tab.label}</a>
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				<div className="mt-4">
					<Outlet />
				</div>
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	NavLink,
	Outlet,
	useLoaderData,
	useMatch,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { SearchInput } from '#app/components/search-input'
import { Drawer, DrawerContent } from '#app/components/ui/drawer'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const students = await prisma.user.findMany({
		where: {
			studentProfile: { isNot: null },
			...(query ? { name: { contains: query } } : {}),
		},
		include: { studentProfile: true },
	})

	return json({ students })
}

export default function Route() {
	const { students } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isEditing = !!useMatch('/app/settings/students/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="h-full w-full overflow-y-scroll p-6">
			<h2>Students</h2>
			<p className="mt-1 max-w-[550px] text-muted-foreground">
				Edit or remove students. All sign-ups obtain a student profile and show
				up here. Students only have access to the home and moduels page.
			</p>
			<div className="mt-4 flex w-full rounded-sm">
				<div className={cn('flex h-full w-full flex-col md:w-1/2 md:border-r')}>
					<div className="flex items-center justify-between pb-3 pr-3">
						<SearchInput />
					</div>
					<div className="flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t pb-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]">
						{students.length > 0 ? (
							students.map(student => (
								<NavLink
									key={student.id}
									to={`/app/settings/students/${student.studentProfile?.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'grid cursor-pointer rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3',
											{ 'border-primary/50 bg-primary/5': isActive },
										)
									}
								>
									<div className="flex items-center gap-1">
										<h4 className="text-sm">Student</h4>
									</div>
									<p>
										{student.name}: {student.email}
									</p>
								</NavLink>
							))
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-1">
								<h3>No students found.</h3>
								<p>When students sign up, they will show up here.</p>
							</div>
						)}
					</div>
				</div>
				{showSidePanel ? (
					<div className="hidden h-[calc(100vh-345px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-207px)] sm:min-h-[400px] md:block">
						<Outlet />
					</div>
				) : (
					<Drawer
						open={isEditing}
						onClose={() => navigate('/app/settings/students')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/settings/students')}
						>
							<Outlet />
						</DrawerContent>
					</Drawer>
				)}
			</div>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

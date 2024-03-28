import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Link,
	NavLink,
	Outlet,
	useLoaderData,
	useMatch,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { PlusIcon } from '#app/components/icons'
import { SearchInput } from '#app/components/search-input'
import { Button } from '#app/components/ui/button'
import { Drawer, DrawerContent } from '#app/components/ui/drawer'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { prisma } from '#app/utils/db.server'
import { cn } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const courses = await prisma.course.findMany({
		where: {
			...(query
				? {
						OR: [
							{ title: { contains: query } },
							{ description: { contains: query } },
						],
					}
				: {}),
		},
	})

	return json({ courses })
}

export default function CoursesRoute() {
	const { courses } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isEditing = !!useMatch('/app/settings/courses/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="h-full w-full">
			<div className="flex w-full rounded-sm">
				<div
					className={cn(
						'flex h-[calc(100vh-104px)] w-full flex-col overflow-y-scroll pl-3 pr-3 pt-3 sm:h-[calc(100vh-54px)] sm:pl-6 sm:pt-6 md:w-1/2 md:border-r md:pr-0',
					)}
				>
					<h2>Courses</h2>
					<p className="mt-1 max-w-[550px] pr-3 text-muted-foreground">
						Add, edit, or remove courses. Courses are the main way to organize
						your content. Students will work through courses to complete your
						program.
					</p>
					<div className="flex items-center justify-between py-3 md:pr-3">
						<SearchInput />
						<Link to="/app/settings/courses/new">
							<Button>
								<PlusIcon className="mr-1" />
								New
							</Button>
						</Link>
					</div>
					<div className="flex h-[calc(100vh-245px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px] md:pr-3">
						{courses.length > 0 ? (
							courses.map(course => (
								<NavLink
									key={course.id}
									to={`/app/settings/courses/${course.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'flex cursor-pointer items-center justify-between gap-2 rounded border p-2 shadow-sm transition hover:bg-muted/50 md:p-3',
											{
												'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
													isActive,
											},
										)
									}
								>
									<p className="font-bold">
										{course.title || 'Untitled course'}
									</p>
								</NavLink>
							))
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-1">
								<h3>No courses found.</h3>
								<p>
									Hit the <code className="bg-foreground/10 px-1">+</code>{' '}
									button above to create one.
								</p>
							</div>
						)}
					</div>
				</div>
				{showSidePanel ? (
					<div className="hidden h-[calc(100vh-111px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-54px)] md:block">
						<Outlet />
					</div>
				) : (
					<Drawer
						open={isEditing}
						onClose={() => navigate('/app/settings/courses')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/settings/courses')}
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

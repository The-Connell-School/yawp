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

	const tutors = await prisma.tutor.findMany({
		where: {
			...(query
				? {
						OR: [
							{ name: { contains: query } },
							{ instructions: { contains: query } },
						],
					}
				: {}),
		},
	})

	return json({ tutors })
}

export default function Route() {
	const { tutors } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isEditing = !!useMatch('/app/settings/tutors/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="h-full w-full overflow-y-scroll p-6">
			<h2>Tutors</h2>
			<p className="mt-1 max-w-[550px] text-muted-foreground">
				Add, edit, or remove tutors. Tutors are the "brains" behind your
				application. Configure them with content or instruct them how to respond
				to students.
			</p>
			<div className="mt-4 flex w-full rounded-sm">
				<div className={cn('flex h-full w-full flex-col md:w-1/2 md:border-r')}>
					<div className="flex items-center justify-between pb-3 pr-3">
						<SearchInput />
						<Link to="/app/settings/tutors/new">
							<Button size="icon" variant="outline">
								<PlusIcon />
							</Button>
						</Link>
					</div>
					<div className="flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]">
						{tutors.length > 0 ? (
							tutors.map(tutor => (
								<NavLink
									key={tutor.id}
									to={`/app/settings/tutors/${tutor.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'grid cursor-pointer rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3',
											{ 'border-primary/50 bg-primary/5': isActive },
										)
									}
								>
									<div className="flex items-center gap-1">
										<h4 className="text-sm">Tutor</h4>
									</div>
									<p>
										{tutor.name}:{' '}
										{(tutor.instructions?.length ?? 0) > 95
											? `${tutor.instructions?.slice(0, 95)}...`
											: tutor.instructions}
									</p>
								</NavLink>
							))
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-1">
								<h3>No tutors found.</h3>
								<p>
									Hit the <code className="bg-foreground/10 px-1">+</code>{' '}
									button above to create one.
								</p>
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
						onClose={() => navigate('/app/settings/tutors')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/settings/tutors')}
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

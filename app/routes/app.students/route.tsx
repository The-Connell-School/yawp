import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
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
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { DEFAULT_ROUTE, cn, getUserImgSrc } from '#app/utils/misc'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const user = await prisma.user.findUnique({
		where: {
			id: userId,
			OR: [
				{ teacherProfile: { isNot: null } },
				{ roles: { some: { name: 'admin' } } },
			],
		},
		include: {
			studentProfiles: {
				include: { user: { include: { image: true } } },
				where: query
					? {
							OR: [
								{ user: { name: { contains: query } } },
								{ user: { email: { contains: query } } },
							],
						}
					: {},
			},
			teacherProfile: true,
		},
	})

	if (!user) {
		return redirect(DEFAULT_ROUTE)
	}

	return json({ user })
}

export default function Route() {
	const { user } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isChildRoute = !!useMatch('/app/students/:id')

	return (
		<main className="h-full w-full overflow-y-scroll p-6">
			<h2>My Students</h2>
			<div className="mt-4 flex w-full rounded-sm">
				<div className={cn('flex h-full w-full flex-col md:w-1/2 md:border-r')}>
					<div className="flex items-center justify-between pb-3 pr-3">
						<SearchInput />
					</div>
					<div className="flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-155px)] sm:min-h-[400px]">
						{user.studentProfiles.length ? (
							user.studentProfiles.map(studentProfile => (
								<NavLink
									key={studentProfile.id}
									to={`/app/students/${studentProfile.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'flex cursor-pointer gap-2 rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3',
											{ 'border-primary/50 bg-primary/5': isActive },
										)
									}
								>
									<img
										src={getUserImgSrc(studentProfile.user.image?.id)}
										alt={studentProfile.user.name ?? studentProfile.user.email}
										className="h-10 w-10 rounded-full object-cover"
									/>
									<div>
										<h4 className="text-sm">Student</h4>
										<p>{studentProfile.user.name}</p>
									</div>
								</NavLink>
							))
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-1">
								<h3>No students found.</h3>
								<p>Students assigned to you will show up here.</p>
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
						open={isChildRoute && !showSidePanel}
						onClose={() => navigate('/app/students')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/students')}
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

import { json, type LoaderFunctionArgs } from '@remix-run/node'
import {
	Outlet,
	useLoaderData,
	useMatch,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { SearchInput } from '#app/components/search-input'
import { SettingsNavLink } from '#app/components/settings-list-item.js'
import { Drawer, DrawerContent } from '#app/components/ui/drawer'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { getUserImgSrc } from '#app/utils/misc'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const students = await prisma.studentProfile.findMany({
		where: {
			workshopLeaderId: userId,
			...(query && {
				OR: [
					{ user: { name: { contains: query } } },
					{ user: { email: { contains: query } } },
				],
			}),
		},
		include: { user: { select: { image: true, name: true, email: true } } },
	})

	return json({ students })
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const [searchParams] = useSearchParams()
	const isViewingStudent = !!useMatch('/app/students/:id')
	const showDrawer = ['base', 'sm', 'md'].includes(breakpoint ?? '')

	return (
		<main className="flex h-full">
			<div className="flex w-full flex-col md:w-1/2 md:border-r">
				<div className="px-3 pt-3">
					<h3>Your students</h3>
					<p className="text-sm text-muted-foreground">
						View and manage students assigned to you.
					</p>
				</div>
				<div className="flex items-center justify-between gap-2 p-3">
					<SearchInput />
				</div>
				<div className="flex flex-col gap-2 overflow-auto border-t p-3 pb-14">
					{data.students.length > 0 ? (
						data.students.map(sp => (
							<SettingsNavLink
								key={sp.id}
								to={`/app/students/${sp.id}?q=${searchParams.get('q') ?? ''}`}
								title={sp.user.name ?? sp.user.email}
								imageSrc={getUserImgSrc(sp.user.image?.id)}
								imageStyle="rounded"
							/>
						))
					) : (
						<div className="flex h-full w-full flex-col items-center justify-center gap-1">
							<h3>No courses found.</h3>
							<p>
								Hit the <code className="bg-foreground/10 px-1">+</code> button
								above to create one.
							</p>
						</div>
					)}
				</div>
			</div>
			<div className="hidden h-full w-1/2 overflow-y-scroll lg:block">
				<Outlet />
			</div>
			<Drawer
				open={showDrawer && isViewingStudent}
				onClose={() => navigate(`/app/students`)}
			>
				<DrawerContent
					className="pb-4"
					onInteractOutside={() => navigate(`/app/students`)}
				>
					<Outlet />
				</DrawerContent>
			</Drawer>
		</main>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

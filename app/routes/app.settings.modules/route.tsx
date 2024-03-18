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

	const modules = await prisma.module_.findMany({
		include: { _count: { select: { instructions: true } } },
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

	return json({ modules })
}

export default function Route() {
	const { modules } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isEditing = !!useMatch('/app/settings/modules/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="h-full w-full">
			<div className="flex w-full rounded-sm">
				<div
					className={cn(
						'flex h-[calc(100vh-104px)] w-full flex-col overflow-y-scroll pl-3 pr-3 pt-3 sm:h-[calc(100vh-54px)] sm:pl-6 sm:pt-6 md:w-1/2 md:border-r md:pr-0',
					)}
				>
					<h2>Modules</h2>
					<p className="mt-1 max-w-[550px] text-muted-foreground">
						Add, edit, or remove modules. Modules are the building blocks of
						your course. Configure the modules to fit your course's needs.
					</p>
					<div className="flex items-center justify-between py-3 pr-3">
						<SearchInput />
						<Link to="/app/settings/modules/new">
							<Button>
								<PlusIcon className="mr-1" />
								New
							</Button>
						</Link>
					</div>
					<div className="flex h-[calc(100vh-245px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]">
						{modules.length > 0 ? (
							modules.map(module_ => (
								<NavLink
									key={module_.id}
									to={`/app/settings/modules/${module_.id}?q=${searchParams.get('q') ?? ''}`}
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
									<p className="font-bold">{module_.title}</p>
									<p className="text-sm text-muted-foreground">
										{module_._count.instructions}{' '}
										{module_._count.instructions === 1
											? 'Instruction'
											: 'Instructions'}
									</p>
								</NavLink>
							))
						) : (
							<div className="flex h-full w-full flex-col items-center justify-center gap-1">
								<h3>No modules found.</h3>
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
						onClose={() => navigate('/app/settings/modules')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/settings/modules')}
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

import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Form,
	Link,
	NavLink,
	Outlet,
	useLoaderData,
	useMatch,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { InfoCircledIcon, PlusIcon, TrashIcon } from '#app/components/icons'
import { SearchInput } from '#app/components/search-input'
import { Badge } from '#app/components/ui/badge'
import { Button } from '#app/components/ui/button'
import { Drawer, DrawerContent } from '#app/components/ui/drawer'
import { Tooltip } from '#app/components/ui/tooltip'
import useBreakpoint from '#app/hooks/useBreakpoint'
import { prisma } from '#app/utils/db.server'
import { cn, useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRole(request, ['admin'])

	const url = new URL(request.url)
	const query = url.searchParams.get('q')

	const teachers = await prisma.user.findMany({
		where: {
			teacherProfile: { isNot: null },
			...(query ? { name: { contains: query } } : {}),
		},
		include: { teacherProfile: true },
	})

	const invitations = await prisma.verification.findMany({
		where: {
			type: 'teacher-onboarding',
			expiresAt: { gt: new Date() },
			...(query ? { target: { contains: query } } : {}),
		},
	})

	return json({ teachers, invitations })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const id = formData.get('id')?.toString()

	if (id) {
		await prisma.verification.delete({ where: { id } })
	}

	return json({ status: 'success' })
}

export default function Route() {
	const { teachers, invitations } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isCreating = !!useMatch('/app/settings/teachers/new')
	const isEditing = !!useMatch('/app/settings/teachers/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="h-full w-full overflow-y-scroll p-6">
			<h2>Teachers</h2>
			<p className="mt-1 max-w-[550px] text-muted-foreground">
				Add, edit, or remove teachers. Teachers can be assigned students,
				allowing them to comment on student's writing and view their module
				progress.
			</p>
			<div className="mt-4 flex w-full rounded-sm">
				<div className={cn('flex h-full w-full flex-col md:w-1/2 md:border-r')}>
					<div className="flex items-center justify-between pb-3 pr-3">
						<SearchInput />
						<Link to="/app/settings/teachers/new">
							<Button size="icon" variant="outline">
								<PlusIcon />
							</Button>
						</Link>
					</div>
					<div className="flex h-[calc(100vh-345px)] min-h-0 w-full flex-col gap-2 overflow-y-scroll border-t py-3 pr-3 sm:h-[calc(100vh-275px)] sm:min-h-[400px]">
						{invitations.length > 0
							? invitations.map(invitation => (
									<div
										key={invitation.id}
										className="flex justify-between gap-2 rounded-sm border bg-foreground/[2%] p-2 opacity-70 md:p-3"
									>
										<div className="flex items-center gap-2">
											<p>{invitation.target}</p>
											<div className="flex items-center">
												<Badge size="sm" variant="secondary">
													invited
												</Badge>
												<Tooltip text="An existing user was not found. Invitation sent.">
													<InfoCircledIcon />
												</Tooltip>
											</div>
										</div>
										<Form
											method="post"
											id={`delete-invitation-${invitation.id}-form`}
											className="grid items-center"
										>
											<input type="hidden" name="id" value={invitation.id} />
											<DeleteButton />
										</Form>
									</div>
								))
							: null}
						{teachers.length > 0 ? (
							teachers.map(teacher => (
								<NavLink
									key={teacher.id}
									to={`/app/settings/teachers/${teacher.teacherProfile?.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'grid cursor-pointer rounded-sm border p-2 transition-opacity hover:opacity-80 md:p-3',
											{ 'border-primary/50 bg-primary/5': isActive },
										)
									}
								>
									<div className="flex items-center gap-1">
										<h4 className="text-sm">Teacher</h4>
									</div>
									<p>
										{teacher.name}: {teacher.email}
									</p>
								</NavLink>
							))
						) : !invitations.length ? (
							<div className="flex h-full w-full flex-col items-center justify-center text-center text-muted-foreground">
								<h3>No teachers found.</h3>
								<p>
									Hit the <code className="bg-foreground/10 px-1">+</code>{' '}
									button above to create one.
								</p>
							</div>
						) : null}
					</div>
				</div>
				{showSidePanel ? (
					<div className="hidden h-[calc(100vh-345px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-207px)] sm:min-h-[400px] md:block">
						<Outlet />
					</div>
				) : (
					<Drawer
						open={isCreating || isEditing}
						onClose={() => navigate('/app/settings/teachers')}
					>
						<DrawerContent
							className="pb-4"
							onInteractOutside={() => navigate('/app/settings/teachers')}
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

function DeleteButton() {
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	return (
		<Button
			{...dc.getButtonProps({ type: 'submit' })}
			disabled={isPending}
			isLoading={isPending}
			size={dc.doubleCheck ? 'sm' : 'icon-sm'}
			variant="outline"
		>
			{dc.doubleCheck ? 'Are you sure?' : <TrashIcon className="h-5 w-5" />}
		</Button>
	)
}

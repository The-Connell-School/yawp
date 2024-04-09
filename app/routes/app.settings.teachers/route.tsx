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
import { Badge } from '#app/components/ui/badge.js'
import { Button } from '#app/components/ui/button'
import { Drawer, DrawerContent } from '#app/components/ui/drawer'
import { Tooltip } from '#app/components/ui/tooltip.js'
import { UserImage } from '#app/components/user-image'
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
		include: { teacherProfile: true, image: true },
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

export default function TeachersRoute() {
	const data = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const breakpoint = useBreakpoint()
	const showSidePanel = ['lg', 'xl', '2xl'].includes(breakpoint ?? '')
	const isEditing = !!useMatch('/app/settings/teachers/:id')
	const [searchParams] = useSearchParams()

	return (
		<main className="flex h-full">
			<div className="flex w-full flex-col md:w-1/2 md:border-r">
				<div className="flex items-center justify-between gap-2 p-3">
					<SearchInput />
					<Link to="/app/settings/teachers/new">
						<Button>
							<PlusIcon className="mr-1" />
							New
						</Button>
					</Link>
				</div>
				<div className="flex flex-col gap-2 overflow-auto border-t p-3 pb-14">
					{data.teachers.length === 0 && data.invitations.length === 0 ? (
						<div className="flex h-full w-full flex-col items-center justify-center gap-1">
							<h3>No teachers found.</h3>
							<p>
								Hit the <code className="bg-foreground/10 px-1">+</code> button
								above to create one.
							</p>
						</div>
					) : null}
					{data.invitations.length > 0
						? data.invitations.map(invitation => (
								<div
									key={invitation.id}
									className="flex items-center justify-between gap-2 rounded border p-2 shadow-sm transition md:p-3"
								>
									<div className="flex items-center gap-2">
										<p className="text-muted-foreground">{invitation.target}</p>
										<div className="flex items-center">
											<Badge size="sm" variant="secondary">
												invited
											</Badge>
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
					{data.teachers.length > 0
						? data.teachers.map(teacher => (
								<NavLink
									key={teacher.id}
									to={`/app/settings/teachers/${teacher.teacherProfile?.id}?q=${searchParams.get('q') ?? ''}`}
									className={({ isActive }) =>
										cn(
											'flex cursor-pointer items-center gap-2 rounded border p-1.5 shadow-sm transition hover:bg-muted/50 md:p-3',
											{
												'border-primary/20 bg-primary/10 text-primary hover:bg-primary/10':
													isActive,
											},
										)
									}
								>
									<UserImage user={teacher} size="xs" />
									<p className="font-bold">{teacher.email}</p>
								</NavLink>
							))
						: null}
				</div>
			</div>
			{showSidePanel ? (
				<div className="hidden h-[calc(100vh-111px)] w-1/2 overflow-y-scroll sm:h-[calc(100vh-54px)] md:block">
					<Outlet />
				</div>
			) : (
				<Drawer
					open={isEditing}
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
			size={dc.doubleCheck ? 'sm' : 'icon-sm'}
			variant={dc.doubleCheck ? 'destructive' : 'outline'}
			className="h-8 text-xs"
		>
			{dc.doubleCheck ? 'Delete invitation' : <TrashIcon className="h-5 w-5" />}
		</Button>
	)
}

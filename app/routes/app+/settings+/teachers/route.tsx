import {
	type ActionFunctionArgs,
	json,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, NavLink, useLoaderData, useSearchParams } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { TrashIcon } from '#app/components/icons'
import { SettingsLayout } from '#app/components/settings-layout.js'
import { Badge } from '#app/components/ui/badge.js'
import { Button } from '#app/components/ui/button'
import { UserImage } from '#app/components/user-image'
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
	const [searchParams] = useSearchParams()

	return (
		<SettingsLayout path="teachers">
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
		</SettingsLayout>
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

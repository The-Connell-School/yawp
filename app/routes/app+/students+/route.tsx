import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node'
import { useLoaderData, useSearchParams, Form } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { TrashIcon } from '#app/components/icons'
import { ListLayout } from '#app/components/list-layout'
import { SettingsNavLink } from '#app/components/settings-list-item'
import { Button } from '#app/components/ui/button'
import { UserImage } from '#app/components/user-image.js'
import { requireUserId } from '#app/utils/auth.server'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck } from '#app/utils/misc'
import { redirectWithToast } from '#app/utils/toast.server'
import { PeriodFilter } from './_components/period-filter';

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const url = new URL(request.url)
	const query = url.searchParams.get('q')
	const period = url.searchParams.get('period')

	const students = await prisma.studentProfile.findMany({
		where: {
			workshopLeaderId: userId,
			...(query && {
				OR: [
					{ user: { name: { contains: query } } },
					{ user: { email: { contains: query } } },
				],
			}),
			...(period && { period: period }),
		},
		include: { user: { select: { image: true, name: true, email: true } } },
	})

	return json({ students })
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserId(request)
	const formData = await request.formData()
	const studentId = formData.get('studentId')

	if (typeof studentId !== 'string') {
		return json({ error: 'Invalid student ID' }, { status: 400 })
	}

	await prisma.studentProfile.delete({ where: { id: studentId } })

	return redirectWithToast('/app/students', {
		type: 'success',
		description: 'Student removed successfully.',
		closeButton: false,
	})
}

export default function Route() {
	const data = useLoaderData<typeof loader>()
	const [searchParams] = useSearchParams()
	const strSearchParams = searchParams.toString()

	return (
		<ListLayout path="students" hideAddButton filters={<div><PeriodFilter /></div>}>
			{data.students.length > 0 ? (
				data.students.map(sp => (
					<SettingsNavLink
						key={sp.id}
						to={`/app/students/${sp.id}${strSearchParams ? `?${strSearchParams}` : ''}`}
						title={sp.user.name ?? sp.user.email}
						deleteButton={<DeleteButton studentId={sp.id} />}
						image={
							<div className="py-2 pl-2">
								<UserImage user={sp.user} size="xs" />
							</div>
						}
					/>
				))
			) : (
				<div className="mt-14 flex h-full w-full flex-col items-center justify-center gap-1">
					<h3>No students found.</h3>
					<p className="w-1/2 text-center text-sm text-muted-foreground">
						Students assigned to you will show up here. If you are expecting
						students to be here, contact your administrator.
					</p>
				</div>
			)}
		</ListLayout>
	)
}

function DeleteButton({ studentId }: { studentId: string }) {
	const dc = useDoubleCheck()

	return (
		<Form method="POST">
			<input type="hidden" name="studentId" value={studentId} />
			<Button
				type="submit"
				variant="ghost"
				size="sm"
				{...dc.getButtonProps({ onClick: e => e.stopPropagation() })}
			>
				{dc.doubleCheck ? (
					'Are you sure?'
				) : (
					<TrashIcon className="h-4 w-4" />
				)}
			</Button>
		</Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

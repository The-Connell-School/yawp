import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Link, json, redirect, useLoaderData } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { TrashIcon } from 'lucide-react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { TeacherForm } from '../app.settings.teachers.new/form'
import { validator } from '../app.settings.teachers.new/form/schema'

const deleteValidator = withZod(z.object({ id: z.string() }))

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing teacher profile id')
	await requireUserWithRole(request, ['admin'])
	const [teacherProfile, allStudents] = await Promise.all([
		prisma.teacherProfile.findUnique({
			where: { id: params.id },
			select: {
				id: true,
				user: {
					select: { email: true, studentProfiles: { select: { user: true } } },
				},
			},
		}),
		prisma.user.findMany({ where: { studentProfile: { isNot: null } } }),
	])

	if (!teacherProfile) {
		return redirect('/app/settings/teachers')
	}

	return json({
		id: teacherProfile.id,
		email: teacherProfile.user.email,
		students: teacherProfile.user.studentProfiles.map(sp => sp.user),
		allStudents,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing teacher id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const subaction = formData.get('subaction')

	if (subaction === 'delete') {
		const { error } = await deleteValidator.validate(formData)
		if (error) return validationError(error)
		await prisma.$transaction([
			prisma.teacherProfile.delete({ where: { id: params.id } }),
			prisma.studentProfile.updateMany({
				where: { workshopLeaderId: params.id },
				data: { workshopLeaderId: null },
			}),
		])
		return redirectWithToast('/app/settings/teachers', {
			type: 'success',
			description: 'Teacher deleted successfully.',
			closeButton: false,
		})
	} else {
		const { error, data } = await validator.validate(formData)
		if (error) return validationError(error)

		const teacherProfile = await prisma.teacherProfile.findUnique({
			where: { id: params.id },
			select: { user: { select: { id: true } } },
		})

		const currentStudents = await prisma.studentProfile.findMany({
			where: { workshopLeaderId: teacherProfile?.user.id },
			select: { user: { select: { email: true } } },
		})

		const studentsToRemove = currentStudents.filter(
			cs => !data.students?.some(s => s.email === cs.user.email),
		)
		const studentsToAdd =
			data.students?.filter(
				s => !currentStudents.some(cs => cs.user.email === s.email),
			) ?? []

		await Promise.all([
			prisma.studentProfile.updateMany({
				where: {
					user: { email: { in: studentsToRemove.map(s => s.user.email) } },
				},
				data: { workshopLeaderId: null },
			}),
			prisma.studentProfile.updateMany({
				where: { user: { email: { in: studentsToAdd.map(s => s.email) } } },
				data: { workshopLeaderId: teacherProfile?.user.id },
			}),
		])

		return redirectWithToast(`/app/settings/teachers/${params.id}`, {
			type: 'success',
			description: 'Teacher updated successfully.',
			closeButton: false,
		})
	}
}

export default function TeachersIdRoute() {
	const { id, allStudents, email, students } = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()
	const formId = `edit-teacher-${id}`

	return (
		<div className="flex flex-col">
			<div className="h-[calc(100vh-122px)] overflow-y-scroll p-6">
				<TeacherForm
					defaultValues={{ email, students }}
					allStudents={allStudents}
					formId={formId}
					key={formId}
				/>
			</div>
			<div className="flex gap-2 px-6 pb-6 pt-1">
				<Button type="submit" disabled={isPending} form={formId}>
					Update
				</Button>
				<Button
					disabled={isPending}
					variant="secondary"
					asChild
					className="md:hidden"
				>
					<Link to="/app/settings/teachers">Cancel</Link>
				</Button>
				<ValidatedForm
					validator={deleteValidator}
					method="POST"
					subaction="delete"
				>
					<input type="hidden" name="id" value={id} />
					<Button
						{...dc.getButtonProps({ type: 'submit' })}
						disabled={isPending}
						size={dc.doubleCheck ? 'default' : 'icon'}
						variant={dc.doubleCheck ? 'destructive' : 'secondary'}
					>
						{dc.doubleCheck ? (
							'Delete teacher'
						) : (
							<TrashIcon className="h-5 w-5" />
						)}
					</Button>
				</ValidatedForm>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

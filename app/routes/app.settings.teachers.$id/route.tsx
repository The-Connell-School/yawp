import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, json, redirect, useLoaderData } from '@remix-run/react'
import { v4 } from 'uuid'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input'
import { TrashIcon } from '#app/components/icons'
import { Button } from '#app/components/ui/button'
import { useFieldArray } from '#app/hooks/useFieldArray'
import { prisma } from '#app/utils/db.server'
import { useDoubleCheck, useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { StudentInput } from './student-input'

const EditSchema = z.object({
	intent: z.literal('submit'),
	students_email: z.union([
		z.array(z.string().optional()),
		z.string().optional(),
	]),
})
const DeleteSchema = z.object({
	intent: z.literal('delete'),
})
const Schema = z.union([EditSchema, DeleteSchema])

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing teacher profile id')
	await requireUserWithRole(request, ['admin'])
	const [teacherProfile, allStudents] = await Promise.all([
		prisma.teacherProfile.findUnique({
			where: { id: params.id },
			select: {
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
		email: teacherProfile.user.email,
		students: teacherProfile.user.studentProfiles.map(sp => sp.user),
		allStudents,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing teacher profile id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: Schema.transform(data => {
			if (data.intent === 'delete') return { intent: 'delete' }
			return data
		}),
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { intent } = submission.value

	if (intent === 'delete') {
		await prisma.$transaction([
			prisma.teacherProfile.delete({ where: { id: params.id } }),
			prisma.studentProfile.updateMany({
				where: { workshopLeaderId: params.id },
				data: { workshopLeaderId: null },
			}),
		])
		return redirect('/app/settings/teachers')
	} else if (intent === 'submit') {
		const value = submission.value as z.infer<typeof EditSchema>
		const raw = value.students_email
		const emails = (Array.isArray(raw) ? raw : [raw]).filter(Boolean)

		const teacherProfile = await prisma.teacherProfile.findUnique({
			where: { id: params.id },
			select: { user: { select: { id: true } } },
		})

		await prisma.studentProfile.updateMany({
			where: { user: { email: { in: emails } } },
			data: { workshopLeaderId: teacherProfile?.user.id },
		})

		return redirectWithToast(`/app/settings/teachers/${params.id}`, {
			type: 'success',
			description: 'Teacher profile updated successfully.',
			closeButton: false,
		})
	}
}

export default function Route() {
	const { email, students, allStudents } = useLoaderData<typeof loader>()
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	const [form, fields] = useForm({
		id: `edit-teacher-profile-${email}`,
		constraint: getZodConstraint(Schema),
		defaultValue: { students, email },
	})

	const {
		fields: studentFields,
		append,
		remove,
	} = useFieldArray(fields.students, ['email'])

	const selectedStudentEmails = studentFields.map(s => s.email)
	const remainingStudents = allStudents.filter(
		s => !selectedStudentEmails.includes(s.email),
	)

	return (
		<Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-full max-h-[calc(100vh-70px)] w-full flex-col gap-4 overflow-y-scroll p-4"
		>
			<FormInput
				inputProps={{ value: email, disabled: true }}
				labelProps={{ children: 'Email' }}
			/>
			<div className="flex flex-col gap-1">
				<label className="mb-1">Students</label>
				{studentFields.map((student, i) => (
					<StudentInput
						key={v4()}
						onDelete={() => remove(i)}
						student={student}
						students={remainingStudents}
						index={i}
						inputProps={{
							type: 'email',
							placeholder: 'email@example.com',
							className: 'pr-10',
							name: 'students_email',
							defaultValue: student?.email,
							required: true,
						}}
					/>
				))}
				<Button
					variant="outline"
					onClick={e => {
						e.preventDefault()
						append({ id: '', email: '' } as any)
					}}
				>
					Add student
				</Button>
			</div>
			<div className="flex gap-1 pb-4">
				<Button name="intent" value="submit" type="submit" disabled={isPending}>
					Update
				</Button>
				<Button
					{...dc.getButtonProps({
						type: 'submit',
						name: 'intent',
						value: 'delete',
					})}
					disabled={isPending}
					size={dc.doubleCheck ? 'default' : 'icon'}
					variant={dc.doubleCheck ? 'destructive' : 'secondary'}
				>
					{dc.doubleCheck ? 'Are you sure?' : <TrashIcon className="h-5 w-5" />}
				</Button>
			</div>
		</Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

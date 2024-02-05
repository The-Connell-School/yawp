import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import { Form, json, redirect, useLoaderData } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { WorkshopLeaderInput } from './workshop-leader-input'

const Schema = z.object({
	workshopLeaderEmail: z.string().email().optional(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	invariant(params.id, 'Missing student profile id')
	await requireUserWithRole(request, ['admin'])
	const [studentProfile, workshopLeaders] = await Promise.all([
		prisma.studentProfile.findUnique({
			where: { id: params.id },
			select: {
				user: { select: { email: true } },
				workshopLeader: { select: { email: true } },
			},
		}),
		prisma.teacherProfile.findMany({
			select: { id: true, user: { select: { email: true } } },
		}),
	])

	if (!studentProfile) {
		return redirect('/app/settings/students')
	}

	return json({
		email: studentProfile.user.email,
		workshopLeaderEmail: studentProfile.workshopLeader?.email,
		workshopLeaders,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	invariant(params.id, 'Missing student profile id')
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: Schema })

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { workshopLeaderEmail: email } = submission.value

	if (email) {
		await prisma.studentProfile.update({
			where: { id: params.id },
			data: { workshopLeader: { connect: { email } } },
		})
	} else {
		await prisma.studentProfile.update({
			where: { id: params.id },
			data: { workshopLeader: { disconnect: true } },
		})
	}

	return redirectWithToast(`/app/settings/students/${params.id}`, {
		type: 'success',
		description: 'Student profile updated successfully.',
		closeButton: false,
	})
}

export default function Route() {
	const { email, workshopLeaderEmail, workshopLeaders } =
		useLoaderData<typeof loader>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: `edit-student-profile-${email}`,
		constraint: getZodConstraint(Schema),
		defaultValue: { email, workshopLeaderEmail },
	})

	return (
		<Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-full w-full flex-col gap-4 p-4"
		>
			<FormInput
				inputProps={{ value: email, disabled: true }}
				labelProps={{ children: 'Email' }}
			/>
			<div className="flex flex-col gap-1">
				<label>Yawp! Teacher</label>
				<WorkshopLeaderInput
					workshopLeaders={workshopLeaders.map(wl => ({
						email: wl.user.email,
					}))}
					field={fields.workshopLeaderEmail}
				/>
			</div>
			<div className="flex gap-1 pb-4">
				<Button name="intent" value="submit" type="submit" disabled={isPending}>
					Update
				</Button>
			</div>
		</Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod as parse } from '@conform-to/zod'
import * as E from '@react-email/components'
import { type ActionFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input'
import { Button } from '#app/components/ui/button'
import { prisma } from '#app/utils/db.server'
import { sendEmail } from '#app/utils/email.server'
import { useIsPending } from '#app/utils/misc'
import { requireUserWithRole } from '#app/utils/permissions'
import { redirectWithToast } from '#app/utils/toast.server'
import { prepareVerification } from '../_auth+/verify'

const Schema = z.object({ email: z.string() })
type Schema = z.infer<typeof Schema>

function InvitationEmail({ url }: { url: string }) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Welcome to Yawp!</E.Text>
				</h1>
				<p>
					<E.Text>
						You've been invited to join Yawp! as a teacher. To get started,
						click the link below.
					</E.Text>
				</p>
				<E.Link href={url}>{url}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRole(request, ['admin'])
	const formData = await request.formData()

	const submission = await parse(formData, {
		async: true,
		schema: Schema.superRefine(async ({ email }, ctx) => {
			const [user, verification] = await Promise.all([
				prisma.user.findUnique({
					where: { email },
					include: { teacherProfile: true },
				}),
				prisma.verification.findFirst({
					where: { target: email, type: 'teacher-onboarding' },
				}),
			])

			if (user && user.teacherProfile) {
				return ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'Email is already a teacher.',
				})
			} else if (verification) {
				return ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: 'Email is already invited.',
				})
			}
		}),
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { email } = submission.value
	const user = await prisma.user.findUnique({
		where: { email },
		include: { roles: true },
	})

	if (user) {
		const update = await prisma.user.update({
			where: { id: user.id },
			data: { teacherProfile: { create: {} } },
			include: { teacherProfile: true },
		})

		return redirectWithToast(
			`/app/settings/teachers/${update.teacherProfile?.id}`,
			{
				type: 'success',
				description: 'Teacher created successfully.',
				closeButton: false,
			},
		)
	} else {
		const { verifyUrl } = await prepareVerification({
			period: 60 * 60 * 48,
			request,
			type: 'teacher-onboarding',
			target: email,
		})

		const response = await sendEmail({
			to: email,
			subject: `You've been invited to join Yawp!`,
			react: <InvitationEmail url={verifyUrl.href} />,
		})

		if (response.status === 'success') {
			return redirectWithToast('/app/settings/teachers', {
				type: 'success',
				description: 'Teacher invitation sent.',
				closeButton: false,
			})
		} else {
			return json(submission.reply({ formErrors: [response.error.message] }), {
				status: 500,
			})
		}
	}
}

export default function Route() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'new-teacher-form',
		lastResult: actionData,
		constraint: getZodConstraint(Schema),
	})

	return (
		<Form
			{...getFormProps(form)}
			method="POST"
			className="flex h-full flex-col justify-start gap-4 p-4"
		>
			<FormInput
				inputProps={{
					...getInputProps(fields.email, { type: 'email' }),
					placeholder: 'email@example.com',
					required: true,
					className: 'max-w-[400px]',
				}}
				labelProps={{ children: 'Email' }}
				errors={fields.email.errors}
			/>
			<p className="text-sm text-muted-foreground">
				Students can be added once the teacher has been created and the user
				exists or has accepted the invitation.
			</p>
			<Button type="submit" isLoading={isPending} className="max-w-fit">
				Create
			</Button>
		</Form>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

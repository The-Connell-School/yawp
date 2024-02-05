import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	json,
	redirect,
} from '@remix-run/node'
import { Form, Link, useActionData } from '@remix-run/react'
import { ErrorList } from '#app/components/forms/error-list'
import { FormInput } from '#app/components/forms/form-input'
import { getPasswordHash, requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/schemas/user'

const CreatePasswordForm = PasswordAndConfirmPasswordSchema

async function requireNoPassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (password) {
		throw redirect('/assistants/profile/password')
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	const formData = await request.formData()
	const submission = await parse(formData, {
		async: true,
		schema: CreatePasswordForm,
	})
	// clear the payload so we don't send the password back to the client
	submission.payload = {}
	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { password } = submission.value

	await prisma.user.update({
		select: { email: true },
		where: { id: userId },
		data: {
			password: {
				create: {
					hash: await getPasswordHash(password),
				},
			},
		},
	})

	return redirect(`/assistants/profile`, { status: 302 })
}

export default function CreatePasswordRoute() {
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'password-create-form',
		constraint: getFieldsetConstraint(CreatePasswordForm),
		lastResult: actionData,
		onValidate({ formData }) {
			return parse(formData, { schema: CreatePasswordForm })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="mx-auto max-w-md">
			<FormInput
				labelProps={{ children: 'New Password' }}
				inputProps={{
					...getInputProps(fields.password, { type: 'password' }),
					autoComplete: 'new-password',
				}}
				errors={fields.password.errors}
			/>
			<FormInput
				labelProps={{ children: 'Confirm New Password' }}
				inputProps={{
					...getInputProps(fields.confirmPassword, {
						type: 'password',
					}),
					autoComplete: 'new-password',
				}}
				errors={fields.confirmPassword.errors}
			/>
			<ErrorList id={form.errorId} errors={form.errors} />
			<div className="grid w-full grid-cols-2 gap-6">
				<Link to="..">Cancel</Link>
				<button type="submit">Create Password</button>
			</div>
		</Form>
	)
}

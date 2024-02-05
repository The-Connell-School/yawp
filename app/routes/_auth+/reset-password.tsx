import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import {
	json,
	redirect,
	type MetaFunction,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, useActionData, useLoaderData } from '@remix-run/react'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireAnonymous, resetUserPassword } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/schemas/user.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

const resetPasswordEmailSessionKey = 'resetPasswordEmail'

export async function handleVerification({ submission }: VerifyFunctionArgs) {
	if (submission.status !== 'success') {
		throw await redirectWithToast('/login', {
			type: 'error',
			title: 'Invalid submission',
			description: 'Submission was not successful. Please try again.',
		})
	}

	const target = submission.value.target
	const user = await prisma.user.findFirst({
		where: { email: target },
		select: { email: true },
	})

	if (!user) {
		return json(submission.reply({ fieldErrors: { code: ['Invalid code'] } }), {
			status: 400,
		})
	}

	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(resetPasswordEmailSessionKey, user.email)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

const ResetPasswordSchema = PasswordAndConfirmPasswordSchema

async function requireResetPasswordEmail(request: Request) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const resetPasswordEmail = verifySession.get(resetPasswordEmailSessionKey)
	if (typeof resetPasswordEmail !== 'string' || !resetPasswordEmail) {
		throw redirect('/login')
	}
	return resetPasswordEmail
}

export async function loader({ request }: LoaderFunctionArgs) {
	const resetPasswordEmail = await requireResetPasswordEmail(request)
	return json({ resetPasswordEmail })
}

export async function action({ request }: ActionFunctionArgs) {
	const resetPasswordEmail = await requireResetPasswordEmail(request)
	const formData = await request.formData()
	const submission = parse(formData, {
		schema: ResetPasswordSchema,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { password } = submission.value
	await resetUserPassword({ email: resetPasswordEmail, password })
	const verifySession = await verifySessionStorage.getSession()
	return redirect('/login', {
		headers: {
			'set-cookie': await verifySessionStorage.destroySession(verifySession),
		},
	})
}

export const meta: MetaFunction = () => {
	return [{ title: 'Reset Password | Yawp!' }]
}

export default function ResetPasswordPage() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'reset-password',
		constraint: getFieldsetConstraint(ResetPasswordSchema),
		lastResult: actionData,
		onValidate({ formData }) {
			return parse(formData, { schema: ResetPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container flex flex-col justify-center pb-32 pt-20">
			<div className="text-center">
				<h1 className="text-h1">Password Reset</h1>
				<p className="text-body-md mt-3 text-muted-foreground">
					Hi, {data.resetPasswordEmail}. No worries. It happens all the time.
				</p>
			</div>
			<div className="mx-auto mt-16 min-w-full max-w-sm px-8 sm:min-w-[368px]">
				<Form
					method="POST"
					{...getFormProps(form)}
					className="flex flex-col gap-4"
				>
					<FormInput
						labelProps={{
							htmlFor: fields.password.id,
							children: 'New Password',
						}}
						inputProps={{
							...getInputProps(fields.password, { type: 'password' }),
							autoComplete: 'new-password',
							autoFocus: true,
						}}
						errors={fields.password.errors}
					/>
					<FormInput
						labelProps={{
							htmlFor: fields.confirmPassword.id,
							children: 'Confirm Password',
						}}
						inputProps={{
							...getInputProps(fields.confirmPassword, { type: 'password' }),
							autoComplete: 'new-password',
						}}
						errors={fields.confirmPassword.errors}
					/>

					<ErrorList errors={form.errors} id={form.errorId} />

					<Button className="w-full" type="submit" disabled={isPending}>
						Reset password
					</Button>
				</Form>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

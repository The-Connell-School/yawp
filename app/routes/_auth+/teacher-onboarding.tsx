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
import {
	Form,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormCheckbox } from '#app/components/forms/form-checkbox.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	requireAnonymous,
	sessionKey,
	signupAsTeacher,
} from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import {
	NameSchema,
	PasswordAndConfirmPasswordSchema,
} from '#app/utils/schemas/user.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { onboardingEmailSessionKey } from './teacher-onboarding.server'

const SignupFormSchema = z
	.object({
		name: NameSchema,
		remember: z.boolean().optional(),
		redirectTo: z.string().optional(),
	})
	.and(PasswordAndConfirmPasswordSchema)

async function requireOnboardingEmail(request: Request) {
	await requireAnonymous(request)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const email = verifySession.get(onboardingEmailSessionKey)
	if (typeof email !== 'string' || !email) {
		throw redirect('/signup')
	}
	return email
}
export async function loader({ request }: LoaderFunctionArgs) {
	const email = await requireOnboardingEmail(request)
	return json({ email })
}

export async function action({ request }: ActionFunctionArgs) {
	const email = await requireOnboardingEmail(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parse(formData, {
		schema: SignupFormSchema.transform(async data => {
			const session = await signupAsTeacher({ ...data, email })
			return { ...data, session }
		}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value) {
		return json(submission.reply(), { status: 400 })
	}

	const { session, remember, redirectTo } = submission.value

	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	authSession.set(sessionKey, session.id)
	const verifySession = await verifySessionStorage.getSession()
	const headers = new Headers()
	headers.append(
		'set-cookie',
		await authSessionStorage.commitSession(authSession, {
			expires: remember ? session.expirationDate : undefined,
		}),
	)
	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirectWithToast(
		safeRedirect(redirectTo),
		{ title: 'Welcome', description: 'Thanks for signing up!' },
		{ headers },
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Setup Yawp! Account' }]
}

export default function SignupRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')

	const [form, fields] = useForm({
		id: 'teacher-onboarding-form',
		constraint: getFieldsetConstraint(SignupFormSchema),
		defaultValue: { redirectTo },
		lastResult: actionData,
		onValidate({ formData }) {
			return parse(formData, { schema: SignupFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto w-full max-w-md px-2 py-20">
			<div className="flex flex-col gap-3 text-center">
				<h1>Welcome, {data.email}!</h1>
				<p>Please enter your details.</p>
			</div>
			<Form
				method="POST"
				className="mx-auto mt-20 flex min-w-full max-w-sm flex-col gap-3 px-8 sm:min-w-[368px]"
				{...getFormProps(form)}
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<FormInput
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={{
						...getInputProps(fields.name, { type: 'text' }),
						autoComplete: 'name',
					}}
					errors={fields.name.errors}
				/>
				<FormInput
					labelProps={{ htmlFor: fields.password.id, children: 'Password' }}
					inputProps={{
						...getInputProps(fields.password, { type: 'password' }),
						autoComplete: 'new-password',
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

				<FormCheckbox
					field={fields.remember}
					labelProps={{
						htmlFor: fields.remember.id,
						children: 'Remember me',
					}}
					buttonProps={getInputProps(fields.remember, { type: 'checkbox' })}
					errors={fields.remember.errors}
				/>

				<input {...getInputProps(fields.redirectTo, { type: 'hidden' })} />
				<ErrorList errors={form.errors} id={form.errorId} />

				<div className="flex items-center justify-between gap-6">
					<Button className="mt-4 w-full" type="submit" disabled={isPending}>
						Create an account
					</Button>
				</div>
			</Form>
		</div>
	)
}

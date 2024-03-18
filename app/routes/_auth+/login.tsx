import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import {
	json,
	type MetaFunction,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormCheckbox } from '#app/components/forms/form-checkbox.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button, button } from '#app/components/ui/button.tsx'
import { login, requireAnonymous } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { DEFAULT_ROUTE, useIsPending } from '#app/utils/misc.tsx'
import { EmailSchema, PasswordSchema } from '#app/utils/schemas/user.ts'
import { useTheme } from '../resources+/theme.tsx'
import { handleNewSession } from './login.server.ts'

const LoginFormSchema = z.object({
	email: EmailSchema,
	password: PasswordSchema,
	redirectTo: z.string().optional(),
	remember: z.boolean().optional(),
})

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: LoginFormSchema.transform(async (data, ctx) => {
			const session = await login(data)

			if (!session) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Invalid email or password',
				})
				return z.NEVER
			}

			return { ...data, session }
		}),
		async: true,
	})
	// get the password off the payload that's sent back
	delete submission.payload.password

	if (
		submission.status !== 'success' ||
		!submission.value ||
		!submission.value.session
	) {
		return json(submission.reply(), { status: 400 })
	}

	const { session, remember, redirectTo } = submission.value

	return handleNewSession({
		request,
		session: session,
		remember: remember ?? false,
		redirectTo: redirectTo ?? DEFAULT_ROUTE,
	})
}

export default function LoginPage() {
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')
	const theme = useTheme()

	const [form, fields] = useForm({
		id: 'login-form',
		constraint: getZodConstraint(LoginFormSchema),
		defaultValue: { redirectTo, remember: false, email: '', password: '' },
		lastResult: actionData,
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto w-full max-w-md pt-20">
			<div className="flex flex-col gap-3 text-center">
				<img
					src={
						theme === 'dark'
							? '/img/yawp_white_logo.png'
							: '/img/yawp_black_logo.png'
					}
					alt="Logo on white background"
					className="mx-auto mb-10 h-auto w-80 rounded object-cover"
				/>
				<h1>Welcome back!</h1>
				<p>Please enter your details.</p>
			</div>
			<div>
				<div className="mx-auto mt-10 w-full max-w-md px-8">
					<Form method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<FormInput
							labelProps={{ children: 'Email' }}
							inputProps={{
								...getInputProps(fields.email, { type: 'text' }),
								autoFocus: true,
								className: 'lowercase',
								autoComplete: 'email',
								type: 'email',
							}}
							errors={fields.email.errors}
						/>
						<FormInput
							labelProps={{ children: 'Password' }}
							inputProps={{
								...getInputProps(fields.password, {
									type: 'password',
								}),
								autoComplete: 'current-password',
							}}
							errors={fields.password.errors}
							className="mt-2"
						/>

						<div className="mt-4 flex items-center justify-between">
							<FormCheckbox
								field={fields.remember}
								labelProps={{
									htmlFor: fields.remember.id,
									children: 'Remember me',
								}}
								buttonProps={getInputProps(fields.remember, {
									type: 'checkbox',
								})}
								errors={fields.remember.errors}
							/>
							<Link
								to="/forgot-password"
								className={button({ variant: 'link' })}
							>
								Forgot password?
							</Link>
						</div>

						<input {...getInputProps(fields.redirectTo, { type: 'hidden' })} />
						<ErrorList errors={form.errors} id={form.errorId} />

						<div className="flex items-center justify-between gap-6 pt-3">
							<Button className="w-full" type="submit" isLoading={isPending}>
								Log in
							</Button>
						</div>
					</Form>
					<div className="flex items-center justify-center gap-2 pt-6">
						<span>New here?</span>
						<Link
							className={button({ variant: 'link' })}
							to={
								redirectTo
									? `/signup?${encodeURIComponent(redirectTo)}`
									: '/signup'
							}
						>
							Create an account
						</Link>
					</div>
				</div>
			</div>
		</div>
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Login to Yawp!' }]
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

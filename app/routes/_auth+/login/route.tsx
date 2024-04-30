import {
	json,
	type MetaFunction,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Link, useSearchParams } from '@remix-run/react'
import { withZod } from '@remix-validated-form/with-zod'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { ValidatedForm, validationError } from 'remix-validated-form'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary'
import { FormInput } from '#app/components/forms/form-input-2'
import { Button, button } from '#app/components/ui/button'
import { useTheme } from '#app/routes/api+/preferences+/theme/route.js'
import { login, requireAnonymous } from '#app/utils/auth.server'
import { validateCSRF } from '#app/utils/csrf.server'
import { checkHoneypot } from '#app/utils/honeypot.server'
import { DEFAULT_ROUTE, useIsPending } from '#app/utils/misc'
import { EmailSchema, PasswordSchema } from '#app/utils/schemas/user'
import { handleNewSession } from './utils.server'

const Schema = z.object({
	email: EmailSchema,
	password: PasswordSchema,
	redirectTo: z.string().nullish(),
})
const validator = withZod(Schema)

export async function loader({ request }: LoaderFunctionArgs) {
	await requireAnonymous(request)
	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireAnonymous(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const { error, data } = await validator.validate(formData)
	if (error) return validationError(error)

	const session = await login(data)

	if (session) {
		return handleNewSession({
			request,
			session,
			redirectTo: data.redirectTo ?? DEFAULT_ROUTE,
		})
	} else {
		return validationError(
			{ fieldErrors: { email: 'Invalid email or password' } },
			data,
		)
	}
}

export default function LoginPage() {
	const isPending = useIsPending()
	const [searchParams] = useSearchParams()
	const redirectTo = searchParams.get('redirectTo')
	const theme = useTheme()

	return (
		<div className="mx-auto w-full max-w-md">
			<div className="mt-8 flex flex-col gap-3 text-center">
				<img
					src={
						theme === 'dark'
							? '/img/logo_for_dark_mode.png'
							: '/img/logo_for_light_mode.png'
					}
					alt="Logo on white background"
					className="mx-auto mb-8 h-auto w-48 rounded object-cover sm:w-52"
				/>
				<h1>Welcome back!</h1>
				<p>Please enter your details.</p>
			</div>
			<div className="mx-auto mt-10 w-full max-w-md px-8">
				<ValidatedForm
					validator={validator}
					method="POST"
					defaultValues={{ redirectTo, email: '', password: '' }}
					className="flex flex-col gap-3"
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="redirectTo" />
					<FormInput type="email" name="email" autoComplete="email" autoFocus />
					<FormInput
						type="password"
						name="password"
						autoComplete="current-password"
					/>
					<div className="flex items-center justify-end">
						<Link to="/forgot-password" className={button({ variant: 'link' })}>
							Forgot password?
						</Link>
					</div>
					<Button className="w-full pt-3" type="submit" isLoading={isPending}>
						Log in
					</Button>
				</ValidatedForm>
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
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Login to Yawp!' }]
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}

import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	json,
	redirect,
	type MetaFunction,
	type LoaderFunctionArgs,
	type ActionFunctionArgs,
} from '@remix-run/node'
import { Form, Link, useActionData, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms/error-list.tsx'
import { FormCheckbox } from '#app/components/forms/form-checkbox.tsx'
import { FormInput } from '#app/components/forms/form-input.tsx'
import { Button, button } from '#app/components/ui/button.tsx'
import { twoFAVerificationType } from '#app/routes/assistants.profile.two-factor/route.tsx'
import {
	getUserId,
	login,
	requireAnonymous,
	sessionKey,
} from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import {
	DEFAULT_ROUTE,
	combineResponseInits,
	useIsPending,
} from '#app/utils/misc.tsx'
import { EmailSchema, PasswordSchema } from '#app/utils/schemas/user.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { useTheme } from '../resources+/theme.tsx'
import { getRedirectToUrl, type VerifyFunctionArgs } from './verify.tsx'

const verifiedTimeKey = 'verified-time'
const unverifiedSessionIdKey = 'unverified-session-id'
const rememberKey = 'remember'

export async function handleNewSession(
	{
		request,
		session,
		redirectTo,
		remember,
	}: {
		request: Request
		session: { userId: string; id: string; expirationDate: Date }
		redirectTo?: string
		remember: boolean
	},
	responseInit?: ResponseInit,
) {
	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: { target: session.userId, type: twoFAVerificationType },
		},
	})
	const userHasTwoFactor = Boolean(verification)

	if (userHasTwoFactor) {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(unverifiedSessionIdKey, session.id)
		verifySession.set(rememberKey, remember)
		const redirectUrl = getRedirectToUrl({
			request,
			type: twoFAVerificationType,
			target: session.userId,
			redirectTo,
		})
		return redirect(
			`${redirectUrl.pathname}?${redirectUrl.searchParams}`,
			combineResponseInits(
				{
					headers: {
						'set-cookie':
							await verifySessionStorage.commitSession(verifySession),
					},
				},
				responseInit,
			),
		)
	} else {
		const authSession = await authSessionStorage.getSession(
			request.headers.get('cookie'),
		)
		authSession.set(sessionKey, session.id)

		return redirect(
			safeRedirect(redirectTo),
			combineResponseInits(
				{
					headers: {
						'set-cookie': await authSessionStorage.commitSession(authSession, {
							expires: remember ? session.expirationDate : undefined,
						}),
					},
				},
				responseInit,
			),
		)
	}
}

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.value, 'Submission should have a value by this point')
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const remember = verifySession.get(rememberKey)
	const { redirectTo } = submission.value
	const headers = new Headers()
	authSession.set(verifiedTimeKey, Date.now())

	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey)
	if (unverifiedSessionId) {
		const session = await prisma.session.findUnique({
			select: { expirationDate: true },
			where: { id: unverifiedSessionId },
		})
		if (!session) {
			throw await redirectWithToast('/login', {
				type: 'error',
				title: 'Invalid session',
				description: 'Could not find session to verify. Please try again.',
			})
		}
		authSession.set(sessionKey, unverifiedSessionId)

		headers.append(
			'set-cookie',
			await authSessionStorage.commitSession(authSession, {
				expires: remember ? session.expirationDate : undefined,
			}),
		)
	} else {
		headers.append(
			'set-cookie',
			await authSessionStorage.commitSession(authSession),
		)
	}

	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirect(safeRedirect(redirectTo), { headers })
}

export async function shouldRequestTwoFA(request: Request) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	if (verifySession.has(unverifiedSessionIdKey)) return true
	const userId = await getUserId(request)
	if (!userId) return false
	// if it's over two hours since they last verified, we should request 2FA again
	const userHasTwoFA = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { target: userId, type: twoFAVerificationType } },
	})
	if (!userHasTwoFA) return false
	const verifiedTime = authSession.get(verifiedTimeKey) ?? new Date(0)
	const twoHours = 1000 * 60 * 2
	return Date.now() - verifiedTime > twoHours
}

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
	const submission = await parse(formData, {
		schema: intent =>
			LoginFormSchema.transform(async (data, ctx) => {
				if (intent !== 'submit') return { ...data, session: null }

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

	if (submission.intent !== 'submit') {
		// @ts-expect-error - conform should probably have support for doing this
		delete submission.value?.password
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value?.session) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}

	const { session, remember, redirectTo } = submission.value

	return handleNewSession({
		request,
		session,
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
		constraint: getFieldsetConstraint(LoginFormSchema),
		defaultValue: { redirectTo },
		lastSubmission: actionData?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: LoginFormSchema })
		},
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
					className="mx-auto mb-10 h-auto w-24 rounded object-cover"
				/>
				<h1>Welcome back!</h1>
				<p>Please enter your details.</p>
			</div>
			<div>
				<div className="mx-auto mt-10 w-full max-w-md px-8">
					<Form method="POST" {...form.props}>
						<AuthenticityTokenInput />
						<HoneypotInputs />
						<FormInput
							labelProps={{ children: 'Email' }}
							inputProps={{
								...conform.input(fields.email),
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
								...conform.input(fields.password, {
									type: 'password',
								}),
								autoComplete: 'current-password',
							}}
							errors={fields.password.errors}
							className="mt-2"
						/>

						<div className="mt-4 flex items-center justify-between">
							<FormCheckbox
								labelProps={{
									htmlFor: fields.remember.id,
									children: 'Remember me',
								}}
								buttonProps={conform.input(fields.remember, {
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

						<input {...conform.input(fields.redirectTo, { type: 'hidden' })} />
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

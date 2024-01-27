import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import { invariant } from '@epic-web/invariant'
import {
	json,
	redirect,
	type DataFunctionArgs,
	type MetaFunction,
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
import { FormSelect } from '#app/components/forms/form-select.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireAnonymous, sessionKey, signup } from '#app/utils/auth.server.ts'
import { validateCSRF } from '#app/utils/csrf.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import {
	NameSchema,
	PasswordAndConfirmPasswordSchema,
} from '#app/utils/schemas/user.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { type VerifyFunctionArgs } from './verify.tsx'

const onboardingEmailSessionKey = 'onboardingEmail'

const SignupFormSchema = z
	.object({
		name: NameSchema,
		school: z.string(),
		teacher: z.string(),
		grade: z.string(),
		workshopTeacherId: z.string().optional(),
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
export async function loader({ request }: DataFunctionArgs) {
	const email = await requireOnboardingEmail(request)
	const workshopTeachers = await prisma.user.findMany({
		where: { roles: { some: { name: 'teacher' } } },
	})

	return json({ email, workshopTeachers })
}

export async function action({ request }: DataFunctionArgs) {
	const email = await requireOnboardingEmail(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)
	const submission = await parse(formData, {
		schema: intent =>
			SignupFormSchema.transform(async data => {
				if (intent !== 'submit') return { ...data, session: null }

				const session = await signup({
					...data,
					email,
				})
				return { ...data, session }
			}),
		async: true,
	})

	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value?.session) {
		return json({ status: 'error', submission } as const, { status: 400 })
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

export async function handleVerification({ submission }: VerifyFunctionArgs) {
	invariant(submission.value, 'submission.value should be defined by now')
	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(onboardingEmailSessionKey, submission.value.target)
	return redirect('/onboarding', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
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
		id: 'onboarding-form',
		constraint: getFieldsetConstraint(SignupFormSchema),
		defaultValue: { redirectTo },
		lastSubmission: actionData?.submission,
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
				className="mx-auto mt-20 flex min-w-full max-w-sm flex-col gap-3 sm:min-w-[368px]"
				{...form.props}
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<FormInput
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={{
						...conform.input(fields.name),
						autoComplete: 'name',
					}}
					errors={fields.name.errors}
				/>
				<div className="flex gap-2">
					<FormInput
						labelProps={{ htmlFor: fields.school.id, children: 'School' }}
						inputProps={{
							...conform.input(fields.school),
							autoComplete: 'name',
							required: true,
						}}
						errors={fields.school.errors}
						className="w-full"
					/>
					<FormInput
						labelProps={{ htmlFor: fields.teacher.id, children: 'Teacher' }}
						inputProps={{
							...conform.input(fields.teacher),
							autoComplete: 'name',
							required: true,
						}}
						errors={fields.teacher.errors}
						className="w-full"
					/>
				</div>
				<div className="flex gap-3">
					<FormInput
						labelProps={{ htmlFor: fields.grade.id, children: 'Grade' }}
						inputProps={{
							...conform.input(fields.grade),
							autoComplete: 'name',
							required: true,
						}}
						errors={fields.grade.errors}
						className="w-full"
					/>
					<FormSelect
						labelProps={{
							htmlFor: fields.workshopTeacherId.id,
							children: 'Yawp! Teacher',
						}}
						selectProps={{
							...conform.input(fields.workshopTeacherId),
							autoComplete: 'name',
							defaultValue: data.workshopTeachers[0]?.id,
							options: data.workshopTeachers.map(teacher => ({
								value: teacher.id,
								label: teacher.name,
							})),
						}}
						errors={fields.workshopTeacherId.errors}
						className="w-full"
					/>
				</div>
				<FormInput
					labelProps={{ htmlFor: fields.password.id, children: 'Password' }}
					inputProps={{
						...conform.input(fields.password, { type: 'password' }),
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
						...conform.input(fields.confirmPassword, { type: 'password' }),
						autoComplete: 'new-password',
					}}
					errors={fields.confirmPassword.errors}
				/>

				<FormCheckbox
					labelProps={{
						htmlFor: fields.remember.id,
						children: 'Remember me',
					}}
					buttonProps={conform.input(fields.remember)}
					errors={fields.remember.errors}
				/>

				<input {...conform.input(fields.redirectTo, { type: 'hidden' })} />
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

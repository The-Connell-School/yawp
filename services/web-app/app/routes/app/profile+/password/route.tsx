import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	data as dataResponse,
	redirect,
} from 'react-router'
import { Form, Link, useActionData } from 'react-router'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList } from '~/components/forms/error-list'
import { FormInput } from '~/components/forms/form-input'
import { IdCardIcon } from '~/components/icons'
import { Button, button } from '~/components/ui/button'
import {
	getPasswordHash,
	requireUserId,
	verifyUserPassword,
} from '~/utils/auth.server.ts'
import { type BreadcrumbHandle } from '~/utils/breadcrumb'
import { validateCSRF } from '~/utils/csrf.server.ts'
import { prisma } from '~/utils/db.server.ts'
import { PasswordSchema } from '~/utils/schemas/user'
import { redirectWithToast } from '~/utils/toast.server.ts'

export const handle: BreadcrumbHandle = {
	breadcrumb: (
		<Link
			to="/app/profile/password"
			className={button({ variant: 'ghost', size: 'sm' })}
		>
			<IdCardIcon className="mr-2" /> Change password
		</Link>
	),
}

const ChangePasswordForm = z
	.object({
		currentPassword: PasswordSchema,
		newPassword: PasswordSchema,
		confirmNewPassword: PasswordSchema,
	})
	.superRefine(({ confirmNewPassword, newPassword }, ctx) => {
		if (confirmNewPassword !== newPassword) {
			ctx.addIssue({
				path: ['confirmNewPassword'],
				code: z.ZodIssueCode.custom,
				message: 'The passwords must match',
			})
		}
	})

async function requirePassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (!password) {
		throw redirect('/app/profile/password/create')
	}
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	return dataResponse({})
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	const submission = await parse(formData, {
		async: true,
		schema: ChangePasswordForm.superRefine(
			async ({ currentPassword, newPassword }, ctx) => {
				if (currentPassword && newPassword) {
					const user = await verifyUserPassword({ id: userId }, currentPassword)
					if (!user) {
						ctx.addIssue({
							path: ['currentPassword'],
							code: z.ZodIssueCode.custom,
							message: 'Incorrect password.',
						})
					}
				}
			},
		),
	})
	// clear the payload so we don't send the password back to the client
	submission.payload = {}
	if (submission.status !== 'success' || !submission.value) {
		return dataResponse(submission.reply(), { status: 400 })
	}

	const { newPassword } = submission.value

	await prisma.user.update({
		select: { email: true },
		where: { id: userId },
		data: {
			password: {
				update: {
					hash: await getPasswordHash(newPassword),
				},
			},
		},
	})

	return redirectWithToast(
		`/app/profile`,
		{
			type: 'success',
			title: 'Password Changed',
			description: 'Your password has been changed.',
		},
		{ status: 302 },
	)
}

export default function ChangePasswordRoute() {
	const actionData = useActionData<typeof action>()

	const [form, fields] = useForm({
		id: 'password-change-form',
		constraint: getFieldsetConstraint(ChangePasswordForm),
		lastResult: actionData,
		onValidate({ formData }) {
			return parse(formData, { schema: ChangePasswordForm })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form method="POST" {...getFormProps(form)} className="max-w-md">
			<AuthenticityTokenInput />
			<FormInput
				labelProps={{ children: 'Current Password' }}
				inputProps={{
					...getInputProps(fields.currentPassword, { type: 'password' }),
					autoComplete: 'current-password',
				}}
				errors={fields.currentPassword.errors}
			/>
			<FormInput
				labelProps={{ children: 'New Password' }}
				inputProps={{
					...getInputProps(fields.newPassword, { type: 'password' }),
					autoComplete: 'new-password',
				}}
				errors={fields.newPassword.errors}
			/>
			<FormInput
				labelProps={{ children: 'Confirm New Password' }}
				inputProps={{
					...getInputProps(fields.confirmNewPassword, {
						type: 'password',
					}),
					autoComplete: 'new-password',
				}}
				errors={fields.confirmNewPassword.errors}
			/>
			<ErrorList id={form.errorId} errors={form.errors} />
			<div className="mt-2 flex items-center justify-between gap-2">
				<Button type="submit">Change Password</Button>
				<Link to=".." className={button({ variant: 'secondary' })}>
					Cancel
				</Link>
			</div>
		</Form>
	)
}

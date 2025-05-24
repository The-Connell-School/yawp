import { getInputProps, getFormProps, useForm } from '@conform-to/react'
import {
	getZodConstraint as getFieldsetConstraint,
	parseWithZod as parse,
} from '@conform-to/zod'
import {
	type ActionFunctionArgs,
	data as dataResponse,
	redirect,
	type LoaderFunctionArgs,
} from 'react-router'
import { Form, useActionData, useLoaderData } from 'react-router'
import * as QRCode from 'qrcode'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { z } from 'zod'
import { ErrorList } from '~/components/forms/error-list.tsx'
import { FormInput } from '~/components/forms/form-input.tsx'
import { Button } from '~/components/ui/button.tsx'
import { isCodeValid } from '~/routes/auth.verify/utils.server'
import { requireUserId } from '~/utils/auth.server.ts'
import { validateCSRF } from '~/utils/csrf.server.ts'
import { prisma } from '~/utils/db.server.ts'
import { getDomainUrl, useIsPending } from '~/utils/misc.tsx'
import { redirectWithToast } from '~/utils/toast.server.ts'
import { getTOTPAuthUri } from '~/utils/totp.server.ts'
import { twoFAVerificationType } from '../two-factor/route.tsx'

const CancelSchema = z.object({ intent: z.literal('cancel') })
const VerifySchema = z.object({
	intent: z.literal('verify'),
	code: z.string().min(6).max(6),
})

const ActionSchema = z.union([CancelSchema, VerifySchema])

export const twoFAVerifyVerificationType = '2fa-verify'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: { type: twoFAVerifyVerificationType, target: userId },
		},
		select: {
			id: true,
			algorithm: true,
			secret: true,
			period: true,
			digits: true,
		},
	})
	if (!verification) {
		return redirect('/app/profile/two-factor')
	}
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { email: true },
	})
	const issuer = new URL(getDomainUrl(request)).host
	const otpUri = getTOTPAuthUri({
		...verification,
		accountName: user.email,
		issuer,
	})
	const qrCode = await QRCode.toDataURL(otpUri)
	return dataResponse({ otpUri, qrCode })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	await validateCSRF(formData, request.headers)

	const submission = await parse(formData, {
		schema: () =>
			ActionSchema.superRefine(async (data, ctx) => {
				if (data.intent === 'cancel') return null
				const codeIsValid = await isCodeValid({
					code: data.code,
					type: twoFAVerifyVerificationType,
					target: userId,
				})
				if (!codeIsValid) {
					ctx.addIssue({
						path: ['code'],
						code: z.ZodIssueCode.custom,
						message: `Invalid code`,
					})
					return z.NEVER
				}
			}),
		async: true,
	})

	if (submission.status !== 'success' || !submission.value) {
		return dataResponse(submission.reply(), { status: 400 })
	}

	switch (submission.value.intent) {
		case 'cancel': {
			await prisma.verification.deleteMany({
				where: { type: twoFAVerifyVerificationType, target: userId },
			})
			return redirect('/app/profile/two-factor')
		}
		case 'verify': {
			await prisma.verification.update({
				where: {
					target_type: { type: twoFAVerifyVerificationType, target: userId },
				},
				data: { type: twoFAVerificationType },
			})
			return redirectWithToast('/app/profile/two-factor', {
				type: 'success',
				title: 'Enabled',
				description: 'Two-factor authentication has been enabled.',
			})
		}
	}
}

export default function TwoFactorRoute() {
	const data = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getFieldsetConstraint(ActionSchema),
		lastResult: actionData,
	})

	return (
		<div>
			<div className="flex flex-col items-center gap-4">
				<img alt="qr code" src={data.qrCode} className="h-56 w-56" />
				<p>Scan this QR code with your authenticator app.</p>
				<p className="text-sm">
					If you cannot scan the QR code, you can manually add this account to
					your authenticator app using this code:
				</p>
				<div className="p-3">
					<pre
						className="whitespace-pre-wrap break-all text-sm"
						aria-label="One-time Password URI"
					>
						{data.otpUri}
					</pre>
				</div>
				<p className="text-sm">
					Once you've added the account, enter the code from your authenticator
					app below. Once you enable 2FA, you will need to enter a code from
					your authenticator app every time you log in or perform important
					actions. Do not lose access to your authenticator app, or you will
					lose access to your account.
				</p>
				<div className="flex w-full max-w-xs flex-col justify-center gap-4">
					<Form method="POST" {...getFormProps(form)} className="flex-1">
						<AuthenticityTokenInput />
						<FormInput
							labelProps={{
								htmlFor: fields.code.id,
								children: 'Code',
							}}
							inputProps={{
								...getInputProps(fields.code, { type: 'text' }),
								autoFocus: true,
								autoComplete: 'one-time-code',
							}}
							errors={fields.code.errors}
						/>

						<div className="min-h-[32px] px-4 pb-3 pt-1">
							<ErrorList id={form.errorId} errors={form.errors} />
						</div>

						<div className="flex justify-center gap-4">
							<Button type="submit" name="intent" value="verify">
								Submit
							</Button>
							<Button
								type="submit"
								name="intent"
								value="cancel"
								disabled={isPending}
								variant="secondary"
							>
								Cancel
							</Button>
						</div>
					</Form>
				</div>
			</div>
		</div>
	)
}

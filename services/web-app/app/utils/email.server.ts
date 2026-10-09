import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2'
import { renderAsync } from '@react-email/components'
import { type ReactElement } from 'react'
import { z } from 'zod'
import { shouldUsePreviewEmailCapture } from './preview-email-capture.server'

const resendErrorSchema = z.union([
	z.object({
		name: z.string(),
		message: z.string(),
		statusCode: z.number(),
	}),
	z.object({
		name: z.literal('UnknownError'),
		message: z.literal('Unknown Error'),
		statusCode: z.literal(500),
		cause: z.any(),
	}),
])
type ResendError = z.infer<typeof resendErrorSchema>

const resendSuccessSchema = z.object({
	id: z.string(),
})

type EmailProvider = 'resend' | 'ses'
type EmailPayload = {
	from: string
	to: string
	subject: string
	html: string
	text: string
}
type SendEmailOptions = {
	to: string
	subject: string
} & (
	| { html: string; text: string; react?: never }
	| { react: ReactElement; html?: never; text?: never }
)

export async function sendEmail(options: SendEmailOptions) {
	const from =
		process.env.SES_FROM_EMAIL ??
		process.env.RESEND_FROM_EMAIL ??
		'test@example.com'
	const content =
		'react' in options && options.react
			? await renderReactEmail(options.react)
			: { html: options.html, text: options.text }

	const email: EmailPayload = {
		from,
		to: options.to,
		subject: options.subject,
		html: content.html,
		text: content.text,
	}

	if (getEmailProvider() === 'ses') {
		return sendEmailWithSes(email)
	}

	return sendEmailWithResend(email)
}

function getEmailProvider(): EmailProvider {
	const provider = process.env.EMAIL_PROVIDER?.toLowerCase()

	if (provider === 'ses' || provider === 'aws-ses') {
		return 'ses'
	}

	return 'resend'
}

async function sendEmailWithResend(email: EmailPayload) {
	if (shouldUsePreviewEmailCapture()) {
		// eslint-disable-next-line no-console
		console.info(
			'[preview-email-capture] accepted (not sent via Resend):',
			JSON.stringify({ to: email.to, subject: email.subject }),
		)
		return {
			status: 'success',
			data: { id: 'preview-captured' },
		} as const
	}

	// feel free to remove this condition once you've set up resend
	if (
		!(process.env.RESEND_API_KEY || process.env.RESEND_FROM_EMAIL) &&
		!process.env.MOCKS
	) {
		// eslint-disable-next-line no-console
		console.error(
			`RESEND_API_KEY or RESEND_FROM_EMAIL not set and we're not in mocks mode.`,
		)
		// eslint-disable-next-line no-console
		console.error(
			`To send emails, set the RESEND_API_KEY environment variable.`,
		)
		// eslint-disable-next-line no-console
		console.error(`Would have sent the following email:`, JSON.stringify(email))
		return {
			status: 'success',
			data: { id: 'mocked' },
		} as const
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		body: JSON.stringify(email),
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
	})
	const data = await response.json()
	const parsedData = resendSuccessSchema.safeParse(data)

	if (response.ok && parsedData.success) {
		return {
			status: 'success',
			data: parsedData,
		} as const
	} else {
		const parseResult = resendErrorSchema.safeParse(data)
		if (parseResult.success) {
			return {
				status: 'error',
				error: parseResult.data,
			} as const
		} else {
			return {
				status: 'error',
				error: {
					name: 'UnknownError',
					message: 'Unknown Error',
					statusCode: 500,
					cause: data,
				} satisfies ResendError,
			} as const
		}
	}
}

async function sendEmailWithSes(email: EmailPayload) {
	try {
		const client = new SESv2Client({
			region:
				process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
		})
		const response = await client.send(
			new SendEmailCommand({
				FromEmailAddress: email.from,
				Destination: { ToAddresses: [email.to] },
				Content: {
					Simple: {
						Subject: { Data: email.subject },
						Body: {
							Html: { Data: email.html },
							Text: { Data: email.text },
						},
					},
				},
			}),
		)

		return {
			status: 'success',
			data: { id: response.MessageId ?? 'unknown' },
		} as const
	} catch (error) {
		return {
			status: 'error',
			error: normalizeSesError(error),
		} as const
	}
}

function normalizeSesError(error: unknown): ResendError {
	if (error instanceof Error) {
		return {
			name: error.name || 'SESError',
			message: error.message || 'Unknown SES Error',
			statusCode: getAwsStatusCode(error),
		}
	}

	return {
		name: 'UnknownError',
		message: 'Unknown Error',
		statusCode: 500,
		cause: error,
	}
}

function getAwsStatusCode(error: Error) {
	const metadata = (error as { $metadata?: { httpStatusCode?: number } })
		.$metadata

	return metadata?.httpStatusCode ?? 500
}

async function renderReactEmail(react: ReactElement) {
	const [html, text] = await Promise.all([
		renderAsync(react),
		renderAsync(react, { plainText: true }),
	])
	return { html, text }
}

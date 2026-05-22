import { createId as cuid } from '@paralleldrive/cuid2'
import { createCookieSessionStorage, redirect } from 'react-router'
import { z } from 'zod'
import { combineHeaders } from './misc.tsx'

export const toastKey = 'toast'

function getSessionSecrets(): string[] {
	const raw = process.env.SESSION_SECRET
	const secrets = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
	return secrets.length ? secrets : ['dev-secret']
}

const TypeSchema = z.enum(['message', 'success', 'error'])
const ToastSchema = z.object({
	description: z.string(),
	id: z.string().default(() => cuid()),
	title: z.string().optional(),
	type: TypeSchema.default('message'),
	closeButton: z.boolean().default(true).optional(),
})

export type Toast = z.infer<typeof ToastSchema>
export type OptionalToast = Omit<Toast, 'id' | 'type'> & {
	id?: string
	type?: z.infer<typeof TypeSchema>
}

export const toastSessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_toast',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: getSessionSecrets(),
		secure: process.env.NODE_ENV === 'production',
	},
})

export async function redirectWithToast(
	url: string,
	toast: OptionalToast,
	init?: ResponseInit,
) {
	return redirect(url, {
		...init,
		headers: combineHeaders(init?.headers, await createToastHeaders(toast)),
	})
}

export async function createToastHeaders(optionalToast: OptionalToast) {
	const session = await toastSessionStorage.getSession()
	const toast = ToastSchema.parse(optionalToast)
	session.flash(toastKey, toast)
	const cookie = await toastSessionStorage.commitSession(session)
	return new Headers({ 'set-cookie': cookie })
}

export async function getToast(request: Request) {
	const session = await toastSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const result = ToastSchema.safeParse(session.get(toastKey))
	const toast = result.success ? result.data : null
	return {
		toast,
		headers: toast
			? new Headers({
					'set-cookie': await toastSessionStorage.destroySession(session),
				})
			: null,
	}
}

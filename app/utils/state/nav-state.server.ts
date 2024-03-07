import { createCookie } from '@remix-run/node'

export const cookieName = 'nav_state'
export type NavState = 'expanded' | 'collapsed'

export const navStateCookie = createCookie(cookieName, {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax',
	secrets: process.env.SESSION_SECRET.split(','),
})

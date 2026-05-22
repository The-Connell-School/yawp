import { createCookie } from 'react-router'

const cookieName = 'nav_state'
export type NavState = 'expanded' | 'collapsed'

function getSessionSecrets(): string[] {
	const raw = process.env.SESSION_SECRET
	const secrets = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
	return secrets.length ? secrets : ['dev-secret']
}

export const navStateCookie = createCookie(cookieName, {
	path: '/',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	sameSite: 'lax',
	secrets: getSessionSecrets(),
})

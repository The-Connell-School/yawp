import { createCookieSessionStorage } from 'react-router'

function getSessionSecrets(): string[] {
	const raw = process.env.SESSION_SECRET
	const secrets = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
	return secrets.length ? secrets : ['dev-secret']
}

export const verifySessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'en_verification',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10, // 10 minutes
		secrets: getSessionSecrets(),
		secure: process.env.NODE_ENV === 'production',
	},
})

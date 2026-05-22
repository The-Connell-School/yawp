import { createCookieSessionStorage } from 'react-router';

function getSessionSecrets(): string[] {
  const raw = process.env.SESSION_SECRET;
  const secrets = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return secrets.length ? secrets : ['dev-secret'];
}

export const invitationCookieStorage = createCookieSessionStorage({
  cookie: {
    name: 'en_invitation',
    sameSite: 'lax',
    path: '/',
    httpOnly: true,
    secrets: getSessionSecrets(),
    secure: process.env.NODE_ENV === 'production',
  },
});

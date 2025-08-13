import { createCookieSessionStorage } from 'react-router';

export const invitationCookieStorage = createCookieSessionStorage({
  cookie: {
    name: 'en_invitation',
    sameSite: 'lax',
    path: '/',
    httpOnly: true,
    secrets: process.env.SESSION_SECRET.split(','),
    secure: process.env.NODE_ENV === 'production',
  },
});

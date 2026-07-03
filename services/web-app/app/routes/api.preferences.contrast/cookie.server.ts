import { createCookie } from 'react-router';

const cookieName = 'contrast_preference';
export type ContrastPreference = 'standard' | 'high';

export const contrastPreferenceCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  secrets: process.env.SESSION_SECRET.split(','),
});

import { createCookie } from 'react-router';
import { z } from 'zod';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

const secure = shouldUseSecureCookies();
const DeepLinkCookieSchema = z
  .object({
    id: z.string().min(1).max(255),
    secret: z.string().min(32).max(255),
  })
  .strict();

const deepLinkCookie = createCookie(
  secure ? '__Secure-yawp-lti-deep-link' : 'yawp-lti-deep-link',
  {
    path: '/lti/deep-link',
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 10 * 60,
    secrets: process.env.SESSION_SECRET.split(','),
  }
);

export async function getLtiDeepLinkCookie(request: Request) {
  const parsed = await deepLinkCookie.parse(request.headers.get('cookie'));
  const result = DeepLinkCookieSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function setLtiDeepLinkCookie(input: { id: string; secret: string }) {
  return deepLinkCookie.serialize(DeepLinkCookieSchema.parse(input));
}

export function destroyLtiDeepLinkCookie() {
  return deepLinkCookie.serialize('', { maxAge: -1 });
}

import { createCookie } from 'react-router';
import { z } from 'zod';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

const secure = shouldUseSecureCookies();
const PendingLinkCookieSchema = z
  .object({
    id: z.string().min(1).max(255),
    secret: z.string().min(32).max(255),
  })
  .strict();

const pendingLtiLinkCookie = createCookie(
  secure ? '__Host-yawp-lti-link' : 'yawp-lti-link',
  {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 15 * 60,
    secrets: process.env.SESSION_SECRET.split(','),
  }
);

export async function getPendingLtiLink(request: Request) {
  const parsed = await pendingLtiLinkCookie.parse(
    request.headers.get('cookie')
  );
  const result = PendingLinkCookieSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function setPendingLtiLink(input: { id: string; secret: string }) {
  return pendingLtiLinkCookie.serialize(PendingLinkCookieSchema.parse(input));
}

export function destroyPendingLtiLink() {
  return pendingLtiLinkCookie.serialize('', { maxAge: -1 });
}

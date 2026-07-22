import { createCookie } from 'react-router';
import { z } from 'zod';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';

const secure = shouldUseSecureCookies();
const BrowserBindingSchema = z
  .object({
    transactionId: z.string().min(1).max(255),
    secret: z.string().min(32).max(255),
  })
  .strict();

const ltiBrowserBindingCookie = createCookie(
  secure ? '__Secure-yawp-lti-bind' : 'yawp-lti-bind',
  {
    path: '/lti/launch',
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 5 * 60,
    secrets: process.env.SESSION_SECRET.split(','),
  }
);

export async function getLtiBrowserBinding(request: Request) {
  const parsed = await ltiBrowserBindingCookie.parse(
    request.headers.get('cookie')
  );
  const result = BrowserBindingSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export function setLtiBrowserBinding(input: {
  transactionId: string;
  secret: string;
}) {
  return ltiBrowserBindingCookie.serialize(BrowserBindingSchema.parse(input));
}

export function destroyLtiBrowserBinding() {
  return ltiBrowserBindingCookie.serialize('', { maxAge: -1 });
}

import type { MarketingPersona } from '@app/marketing-media';

const PERSONA_DOMAIN = 'yawp.local';

/** Persona keys map to the seeded dev accounts: student-graded → dev.student.graded. */
export function personaEmail(persona: MarketingPersona): string {
  return `dev.${persona.replace(/-/g, '.')}@${PERSONA_DOMAIN}`;
}

export const PREVIEW_ACCESS_PATH = '/auth/preview-access';

/**
 * Clear a preview's access gate the way a reviewer does — by presenting a seat
 * code — and keep the cookie it hands back.
 *
 * This has to happen before anything else: the gate exempts only the
 * healthcheck and its own route, so even the dev-login POST is refused
 * without it, and page loads bounce to the code screen.
 */
export async function fetchPreviewAccessCookies(
  baseUrl: string,
  accessCode: string
): Promise<{ name: string; value: string; url: string }[]> {
  const response = await fetch(new URL(PREVIEW_ACCESS_PATH, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: accessCode, returnTo: '/' }).toString(),
    redirect: 'manual',
  });

  // A wrong code re-renders the form with a 400 rather than redirecting, so a
  // non-redirect here means the code was rejected, not that the gate is off.
  if (response.status < 300 || response.status >= 400) {
    throw new Error(
      `Preview access code was rejected (${response.status}). The renderer needs a code from PREVIEW_ACCESS_SEATS.`
    );
  }

  const cookies = parseSessionCookies(response.headers.getSetCookie(), baseUrl);
  if (cookies.length === 0) {
    throw new Error('Preview access returned no cookie.');
  }
  return cookies;
}

/**
 * Turn Set-Cookie headers into Playwright cookies scoped to the render target.
 * Attributes beyond name and value are dropped: the browser only needs to send
 * the session back to the same origin for the length of one render.
 */
export function parseSessionCookies(
  setCookieHeaders: string[],
  baseUrl: string
): { name: string; value: string; url: string }[] {
  return setCookieHeaders
    .map((header) => {
      const [pair] = header.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim(),
        url: baseUrl,
      };
    })
    .filter((cookie): cookie is { name: string; value: string; url: string } =>
      Boolean(cookie?.name)
    );
}

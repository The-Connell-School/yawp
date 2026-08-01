import type { MarketingPersona } from '@app/marketing-media';

const PERSONA_DOMAIN = 'yawp.local';

/** Persona keys map to the seeded dev accounts: student-graded → dev.student.graded. */
export function personaEmail(persona: MarketingPersona): string {
  return `dev.${persona.replace(/-/g, '.')}@${PERSONA_DOMAIN}`;
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

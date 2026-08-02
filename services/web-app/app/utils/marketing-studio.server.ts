/**
 * Gate for the admin Marketing Studio.
 *
 * The studio drives a real browser through a signed-in session and publishes
 * what it films, so it stays off unless three separate things are true. The
 * third one — an explicit statement that the render target holds demo data — is
 * asked for rather than inferred, for the same reason local dev auth stopped
 * inferring "this must be local" from NODE_ENV: an inference that is wrong once
 * puts real student work in a marketing asset.
 */

const DEMO_CONFIRMATION = 'confirmed';

export function getMarketingRenderTarget(): string | null {
  if (process.env.MARKETING_RENDER_TARGET_IS_DEMO !== DEMO_CONFIRMATION) {
    return null;
  }

  const raw = process.env.MARKETING_RENDER_TARGET_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  return (
    url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/, ''))
  );
}

export function isMarketingStudioEnabled(): boolean {
  return (
    process.env.MARKETING_STUDIO_ENABLED === 'on' &&
    getMarketingRenderTarget() !== null
  );
}

/**
 * Directory holding disk-stored render outputs, for environments without AWS
 * credentials (previews). When set, the app serves media from this directory
 * itself instead of signing S3 URLs.
 */
export function getMarketingMediaDir(): string | null {
  return process.env.MARKETING_MEDIA_DIR?.trim() || null;
}

/** 404 rather than 403: a disabled surface should not advertise that it exists. */
export function requireMarketingStudioEnabled(): void {
  if (!isMarketingStudioEnabled()) {
    throw new Response('Not Found', { status: 404 });
  }
}

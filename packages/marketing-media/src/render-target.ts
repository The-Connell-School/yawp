/**
 * The only hosts the Marketing Studio may ever film.
 *
 * The `MARKETING_RENDER_TARGET_IS_DEMO=confirmed` variable is an operator's
 * statement that a target holds demo data — but a statement can be mis-set.
 * This list is the backstop that makes the mistake harmless: the studio has no
 * business seeing production at all, so anything that is not a preview, the
 * demo box, or local development is refused outright, whatever the variables
 * claim. Production (`yawp.school`) is not merely absent from this list — its
 * absence is the point.
 */

/** Exact hosts that are always demo surfaces. */
const EXACT_HOSTS = new Set(['localhost', '127.0.0.1', 'demo.yawp.school']);

/**
 * Suffix for per-PR previews (`pr-123.preview.yawp.school`). The leading dot
 * keeps the match on a label boundary: `x.preview.yawp.school` qualifies,
 * `evilpreview.yawp.school` does not.
 */
const PREVIEW_SUFFIX = '.preview.yawp.school';

export function isAllowedRenderTargetHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (EXACT_HOSTS.has(host)) return true;
  return host.length > PREVIEW_SUFFIX.length && host.endsWith(PREVIEW_SUFFIX);
}

/** One sentence for error messages, so refusals explain the rule. */
export const ALLOWED_RENDER_TARGETS_DESCRIPTION =
  'a *.preview.yawp.school preview, demo.yawp.school, or local development (localhost/127.0.0.1) — the studio never films production';

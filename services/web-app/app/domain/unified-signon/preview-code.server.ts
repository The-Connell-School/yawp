import { createHash, timingSafeEqual } from 'node:crypto';
import {
  isYawpPrPreviewDatabase,
  previewDatabaseNameFromUrl,
} from '~/utils/preview-email-capture.server';

/** Raw codes live only in this preview process; reads enforce the challenge TTL.
 * Pruned on access. Restarts discard them; QA can request another normal challenge. */
const captures = new Map<string, { code: string; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;
const MAX_CAPTURES = 500;

function previewDatabase(): string | null {
  if (process.env.YAWP_ENVIRONMENT !== 'preview' || process.env.PREVIEW_SLUG === 'demo') return null;
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    // PostgreSQL URLs use WHATWG's non-special parsing. Normalize just the
    // hostname as a special URL as well, rejecting encoded/numeric loopback forms.
    const host = new URL(`http://${url.host}`).hostname.toLowerCase().replace(/\.$/, '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !host || url.hash ||
      host === 'localhost' || host.endsWith('.localhost') ||
      host.startsWith('127.') || host === '0.0.0.0' ||
      host === '[::1]' || host === '[::]' || host.startsWith('[::ffff:') ||
      !/^\/yawp_pr_[0-9]+$/.test(url.pathname)
    ) return null;
    const name = previewDatabaseNameFromUrl(url.href);
    return isYawpPrPreviewDatabase(name) ? url.href : null;
  } catch {
    return null;
  }
}

// Reuse the existing server-side preview access secret. Never accept a human
// access-seat code or the application session signing secret here.
function qaSecret(): string | null {
  const secret = process.env.PREVIEW_ACCESS_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function previewCodeCaptureEnabled(): boolean {
  return previewDatabase() !== null && qaSecret() !== null;
}

export function authenticatePreviewCodeRequest(request: Request): boolean {
  const secret = qaSecret();
  if (!previewDatabase() || !secret) return false;
  const provided = request.headers.get('authorization');
  if (!provided?.startsWith('Bearer ') || provided.length > 4096) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(provided.slice(7)), hash(secret));
}

function keyFor(email: string): string {
  // Digest the deployment scope and recipient so the map doesn't retain either.
  return createHash('sha256')
    .update(JSON.stringify([previewDatabase(), qaSecret(), email.trim().toLowerCase()]))
    .digest('hex');
}

function prune() {
  const now = Date.now();
  for (const [key, entry] of captures) {
    if (entry.expiresAt <= now) captures.delete(key);
  }
}

/** False means ineligible; the caller must not fall through to a provider on previews. */
export function capturePreviewCode(email: string, code: string): boolean {
  if (!previewCodeCaptureEnabled()) return false;
  prune();
  const key = keyFor(email);
  captures.delete(key);
  if (captures.size >= MAX_CAPTURES) captures.delete(captures.keys().next().value!);
  captures.set(key, { code, expiresAt: Date.now() + TTL_MS });
  return true;
}

/** Only the authenticated private route may read codes. No listing operation. */
export function takePreviewCode(request: Request, email: string): string | null {
  if (!authenticatePreviewCodeRequest(request)) return null;
  prune();
  const key = keyFor(email);
  const entry = captures.get(key);
  captures.delete(key);
  return entry?.code ?? null;
}

import { createHash, timingSafeEqual } from 'node:crypto';
import { createCookie, type MiddlewareFunction } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';
import {
  enforcePreviewSeatSession,
  type PreviewSeatSessionGuard,
} from './preview-session-seat.server';

export const PREVIEW_ACCESS_COOKIE_NAME = '__yawp_preview_access';
export const PREVIEW_ACCESS_PATH = '/auth/preview-access';
export const PREVIEW_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

const ACCESS_SEAT_VALUE_PREFIX = 'seat-v1:';
const ACCESS_CODE_PATTERN = /^[a-z]+-[a-z]+-[1-9][0-9]{3}$/;
const OPEN_PATHS = new Set([
  '/api/healthcheck',
  PREVIEW_ACCESS_PATH,
  `${PREVIEW_ACCESS_PATH}.data`,
]);

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

export type PreviewAccessSeat = {
  organizationId: string;
  label: string;
};

type ConfiguredPreviewAccessSeat = PreviewAccessSeat & { code: string };

function legacyConfiguredSeats(): ConfiguredPreviewAccessSeat[] {
  return String(process.env.PREVIEW_ACCESS_CODES ?? '')
    .split(/[;,\n]/)
    .map(normalizeCode)
    .filter((code) => ACCESS_CODE_PATTERN.test(code))
    .map((code) => ({
      code,
      organizationId: 'local-dev-org',
      label: 'Brian Connell',
    }));
}

function configuredSeats(): ConfiguredPreviewAccessSeat[] {
  const raw = String(process.env.PREVIEW_ACCESS_SEATS ?? '').trim();
  if (!raw) return legacyConfiguredSeats();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const seats = parsed.map((value): ConfiguredPreviewAccessSeat | null => {
      if (!value || typeof value !== 'object') return null;
      const record = value as Record<string, unknown>;
      const code = normalizeCode(String(record.code ?? ''));
      const organizationId = String(record.organizationId ?? '').trim();
      const label = String(record.label ?? '').trim();
      if (
        !ACCESS_CODE_PATTERN.test(code) ||
        !/^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId) ||
        !label ||
        label.length > 100
      ) {
        return null;
      }
      return { code, organizationId, label };
    });
    if (seats.some((seat) => seat === null)) return [];

    const validSeats = seats as ConfiguredPreviewAccessSeat[];
    if (
      new Set(validSeats.map(({ code }) => code)).size !== validSeats.length ||
      new Set(validSeats.map(({ organizationId }) => organizationId)).size !==
        validSeats.length
    ) {
      return [];
    }
    return validSeats;
  } catch {
    return [];
  }
}

function accessSecrets() {
  return String(process.env.PREVIEW_ACCESS_SECRET ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
}

export function isPreviewAccessGateEnabled() {
  return process.env.PREVIEW_ACCESS_GATE === 'on';
}

export function isIsolatedPreviewSeatMode() {
  return (
    isPreviewAccessGateEnabled() && process.env.PREVIEW_DATA_MODE === 'seed'
  );
}

/**
 * Platform admin is deliberately preserved inside preview seats.
 *
 * Suppressing it kept one seat's admin out of another seat's data, but it also removed
 * the Admin surfaces from preview entirely — you could no longer test them at all, which
 * previews exist to allow. Seat isolation is about testers not colliding by accident,
 * not a security boundary between them, so parity with production wins here.
 */
export function hasEffectivePlatformAdmin(
  storedIsAdmin: boolean | null | undefined,
) {
  return Boolean(storedIsAdmin);
}

export function isPreviewAccessConfigured() {
  return configuredSeats().length > 0 && accessSecrets().length > 0;
}

function digestCode(value: string) {
  return createHash('sha256').update(value).digest();
}

export function findPreviewAccessSeatByCode(
  value: string,
): PreviewAccessSeat | null {
  if (!isPreviewAccessConfigured()) return null;
  const candidate = normalizeCode(value);
  if (!ACCESS_CODE_PATTERN.test(candidate)) return null;

  const candidateDigest = digestCode(candidate);
  let match: ConfiguredPreviewAccessSeat | null = null;
  for (const configured of configuredSeats()) {
    const matches = timingSafeEqual(candidateDigest, digestCode(configured.code));
    if (matches) match = configured;
  }
  return match
    ? { organizationId: match.organizationId, label: match.label }
    : null;
}

export function validatePreviewAccessCode(value: string) {
  return findPreviewAccessSeatByCode(value) !== null;
}

export function createPreviewAccessCookie() {
  const secrets = accessSecrets();
  return createCookie(PREVIEW_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    maxAge: PREVIEW_ACCESS_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    secrets: secrets.length > 0 ? secrets : ['preview-access-unconfigured'],
    secure: shouldUseSecureCookies(),
  });
}

export async function grantPreviewAccessCookie(seat: PreviewAccessSeat) {
  if (!isPreviewAccessConfigured()) {
    throw new Error('Preview access gate is not configured.');
  }
  const configured = configuredSeats().find(
    (candidate) =>
      candidate.organizationId === seat.organizationId &&
      candidate.label === seat.label,
  );
  if (!configured) {
    throw new Error('Preview access seat is not configured.');
  }
  return createPreviewAccessCookie().serialize(
    `${ACCESS_SEAT_VALUE_PREFIX}${configured.organizationId}`,
  );
}

export async function clearPreviewAccessCookie() {
  return createPreviewAccessCookie().serialize('', { maxAge: 0 });
}

export async function getPreviewAccessSeat(
  request: Request,
): Promise<PreviewAccessSeat | null> {
  if (!isPreviewAccessConfigured()) return null;
  const value = await createPreviewAccessCookie().parse(
    request.headers.get('cookie'),
  );
  if (typeof value !== 'string' || !value.startsWith(ACCESS_SEAT_VALUE_PREFIX)) {
    return null;
  }
  const organizationId = value.slice(ACCESS_SEAT_VALUE_PREFIX.length);
  const seat = configuredSeats().find(
    (candidate) => candidate.organizationId === organizationId,
  );
  return seat
    ? { organizationId: seat.organizationId, label: seat.label }
    : null;
}

export async function hasPreviewAccess(request: Request) {
  return (await getPreviewAccessSeat(request)) !== null;
}

function blockedResponse(request: Request) {
  const url = new URL(request.url);
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD';

  if (!isReadRequest || url.pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'Preview access code required.' },
      {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  const returnTo = `${url.pathname}${url.search}`;
  const search = new URLSearchParams({ returnTo });
  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: `${PREVIEW_ACCESS_PATH}?${search}`,
    },
  });
}

/**
 * The preview access flag and this request-boundary middleware are the same switch.
 * Therefore PREVIEW_ACCESS_GATE=on cannot expose role-swap without also putting the
 * gate in front of every descendant loader, action, and resource/API route.
 */
export function createPreviewAccessMiddleware(
  sessionGuard: PreviewSeatSessionGuard = enforcePreviewSeatSession,
): MiddlewareFunction<Response> {
  return async ({ request }, next) => {
    if (!isPreviewAccessGateEnabled()) return next();

    const pathname = new URL(request.url).pathname;
    if (OPEN_PATHS.has(pathname)) return next();
    const seat = await getPreviewAccessSeat(request);
    if (!seat) return blockedResponse(request);

    if (isIsolatedPreviewSeatMode()) {
      const sessionBlock = await sessionGuard(request, seat);
      if (sessionBlock) return sessionBlock;
    }
    return next();
  };
}

export const previewAccessMiddleware = createPreviewAccessMiddleware();

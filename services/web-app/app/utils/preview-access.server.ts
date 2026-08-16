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

const DEFAULT_MASTER_ORGANIZATION_ID = 'local-dev-org';
const MASTER_SEAT_LABEL = 'Master';

function legacyConfiguredMasterSeat(): ConfiguredPreviewAccessSeat | null {
  const code = String(process.env.PREVIEW_ACCESS_CODES ?? '')
    .split(/[;,\n]/)
    .map(normalizeCode)
    .find(Boolean);
  return code && ACCESS_CODE_PATTERN.test(code)
    ? {
        code,
        organizationId: DEFAULT_MASTER_ORGANIZATION_ID,
        label: MASTER_SEAT_LABEL,
      }
    : null;
}

function configuredMasterSeat(): ConfiguredPreviewAccessSeat | null {
  const raw = String(process.env.PREVIEW_ACCESS_SEATS ?? '').trim();
  if (!raw) return legacyConfiguredMasterSeat();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const configuredMasterOrganizationId =
      process.env.PREVIEW_DATA_MODE === 'sanitized-production'
        ? String(
            (parsed[0] as Record<string, unknown> | undefined)
              ?.organizationId ?? ''
          ).trim()
        : DEFAULT_MASTER_ORGANIZATION_ID;
    const master = parsed.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        String(
          (value as Record<string, unknown>).organizationId ?? ''
        ).trim() === configuredMasterOrganizationId
    );
    if (!master || typeof master !== 'object') return null;
    const code = normalizeCode(
      String((master as Record<string, unknown>).code ?? '')
    );
    return ACCESS_CODE_PATTERN.test(code)
      ? {
          code,
          organizationId: configuredMasterOrganizationId,
          label:
            String((master as Record<string, unknown>).label ?? '').trim() ||
            MASTER_SEAT_LABEL,
        }
      : null;
  } catch {
    return null;
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
    isPreviewAccessGateEnabled() &&
    process.env.PREVIEW_DATA_MODE === 'seed'
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
  storedIsAdmin: boolean | null | undefined
) {
  return Boolean(storedIsAdmin);
}

export function isPreviewAccessConfigured() {
  return configuredMasterSeat() !== null && accessSecrets().length > 0;
}

function digestCode(value: string) {
  return createHash('sha256').update(value).digest();
}

export type PreviewAccessSeatRepository = {
  findByCode(code: string): Promise<{ id: string; name: string } | null>;
  findById(id: string): Promise<{
    id: string;
    name: string;
    previewSeatCode: string | null;
  } | null>;
};

const databasePreviewSeatRepository: PreviewAccessSeatRepository = {
  async findByCode(code) {
    const { prisma } = await import('./db.server.ts');
    return prisma.organization.findUnique({
      where: { previewSeatCode: code },
      select: { id: true, name: true },
    });
  },
  async findById(id) {
    const { prisma } = await import('./db.server.ts');
    return prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, previewSeatCode: true },
    });
  },
};

export function getPreviewMasterAccessCode() {
  return configuredMasterSeat()?.code ?? null;
}

export async function findPreviewAccessSeatByCode(
  value: string,
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): Promise<PreviewAccessSeat | null> {
  if (!isPreviewAccessConfigured()) return null;
  const candidate = normalizeCode(value);
  if (!ACCESS_CODE_PATTERN.test(candidate)) return null;

  const master = configuredMasterSeat();
  if (!master) return null;
  const candidateDigest = digestCode(candidate);
  if (timingSafeEqual(candidateDigest, digestCode(master.code))) {
    return { organizationId: master.organizationId, label: master.label };
  }

  const runtimeSeat = await repository.findByCode(candidate);
  return runtimeSeat
    ? { organizationId: runtimeSeat.id, label: runtimeSeat.name }
    : null;
}

export async function validatePreviewAccessCode(
  value: string,
  repository?: PreviewAccessSeatRepository
) {
  return (await findPreviewAccessSeatByCode(value, repository)) !== null;
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
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(seat.organizationId)) {
    throw new Error('Preview access seat has an invalid organization.');
  }
  return createPreviewAccessCookie().serialize(
    `${ACCESS_SEAT_VALUE_PREFIX}${seat.organizationId}`
  );
}

export async function clearPreviewAccessCookie() {
  return createPreviewAccessCookie().serialize('', { maxAge: 0 });
}

export async function getPreviewAccessSeat(
  request: Request,
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): Promise<PreviewAccessSeat | null> {
  if (!isPreviewAccessConfigured()) return null;
  const value = await createPreviewAccessCookie().parse(
    request.headers.get('cookie')
  );
  if (
    typeof value !== 'string' ||
    !value.startsWith(ACCESS_SEAT_VALUE_PREFIX)
  ) {
    return null;
  }
  const organizationId = value.slice(ACCESS_SEAT_VALUE_PREFIX.length);
  const master = configuredMasterSeat();
  if (organizationId === master?.organizationId) {
    return { organizationId, label: master.label };
  }
  const seat = await repository.findById(organizationId);
  return seat?.previewSeatCode !== null && seat?.previewSeatCode !== undefined
    ? { organizationId: seat.id, label: seat.name }
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
      }
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
 * Lets a PR-comment link log a tester straight in: `?code=<preview-access-code>`
 * appended to any in-app URL. Consumes the code through the same validation path
 * as the POST form, sets the same signed cookie, then 303s to the same URL with
 * `code` stripped so it never lingers in the address bar, browser history, or a
 * Referer header. An unknown/invalid code falls through to the normal gate below
 * exactly as if the param had never been there.
 */
async function consumeCodeQueryParam(
  request: Request,
  repository: PreviewAccessSeatRepository
): Promise<Response | null> {
  if (request.method !== 'GET') return null;

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return null;

  const seat = await findPreviewAccessSeatByCode(code, repository);
  if (!seat) return null;

  url.searchParams.delete('code');
  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
      'set-cookie': await grantPreviewAccessCookie(seat),
      Location: `${url.pathname}${url.search}`,
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
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): MiddlewareFunction<Response> {
  return async ({ request }, next) => {
    if (!isPreviewAccessGateEnabled()) return next();

    const pathname = new URL(request.url).pathname;
    if (OPEN_PATHS.has(pathname)) return next();

    const seat = await getPreviewAccessSeat(request, repository);
    if (!seat) {
      const oneClickEntry = await consumeCodeQueryParam(request, repository);
      if (oneClickEntry) return oneClickEntry;
    }
    if (!seat) return blockedResponse(request);

    if (isIsolatedPreviewSeatMode()) {
      const sessionBlock = await sessionGuard(request, seat);
      if (sessionBlock) return sessionBlock;
    }
    return next();
  };
}

export const previewAccessMiddleware = createPreviewAccessMiddleware();

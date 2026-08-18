import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createCookie, type MiddlewareFunction } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';
import {
  enforcePreviewSeatSession,
  type PreviewSeatSessionGuard,
} from './preview-session-seat.server';

export const PREVIEW_ACCESS_COOKIE_NAME = '__yawp_preview_access';
export const PREVIEW_MASTER_SELECTION_COOKIE_NAME = '__yawp_preview_master';
export const PREVIEW_ACCESS_PATH = '/auth/preview-access';
export const PREVIEW_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;
export const PREVIEW_MASTER_SELECTION_MAX_AGE = 10 * 60;
export const PREVIEW_AUTHORIZED_ACTIVITY_HEADER = 'X-Yawp-Preview-Authorized';

const ACCESS_SEAT_VALUE_PREFIX = 'seat-v3:';
const MASTER_ACCESS_SEAT_VALUE_PREFIX = 'seat-master-v1:';
const LEGACY_ACCESS_SEAT_VALUE_PREFIX = 'seat-v2:';
const MASTER_SELECTION_VALUE_PREFIX = 'master-v2:';
const ACCESS_COOKIE_CLOCK_SKEW_SECONDS = 5 * 60;
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
  accessKind?: 'organization' | 'master';
};

export type PreviewAccessCredential =
  { kind: 'master' } | { kind: 'organization'; seat: PreviewAccessSeat };

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

function configuredPrimarySeat(): ConfiguredPreviewAccessSeat | null {
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

function configuredGlobalMasterCode() {
  const code = normalizeCode(
    String(process.env.PREVIEW_MASTER_ACCESS_CODE ?? '')
  );
  return ACCESS_CODE_PATTERN.test(code) ? code : null;
}

function accessSecrets() {
  return String(process.env.PREVIEW_ACCESS_SECRET ?? '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(Boolean);
}

function masterCredentialVersion() {
  const masterCode = configuredGlobalMasterCode();
  const [accessSecret] = accessSecrets();
  if (!masterCode || !accessSecret) return null;
  return createHmac('sha256', accessSecret)
    .update(masterCode)
    .digest('hex')
    .slice(0, 24);
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
  storedIsAdmin: boolean | null | undefined
) {
  return Boolean(storedIsAdmin);
}

export function isPreviewAccessConfigured() {
  return (
    (configuredGlobalMasterCode() !== null ||
      configuredPrimarySeat() !== null) &&
    accessSecrets().length > 0
  );
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
  return configuredGlobalMasterCode() ?? configuredPrimarySeat()?.code ?? null;
}

export function getConfiguredPreviewOrganizationAccessCode(
  organizationId: string
) {
  const seat = configuredPrimarySeat();
  return seat?.organizationId === organizationId ? seat.code : null;
}

export async function findPreviewAccessCredentialByCode(
  value: string,
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): Promise<PreviewAccessCredential | null> {
  if (!isPreviewAccessConfigured()) return null;
  const candidate = normalizeCode(value);
  if (!ACCESS_CODE_PATTERN.test(candidate)) return null;

  const candidateDigest = digestCode(candidate);
  const globalMasterCode = configuredGlobalMasterCode();
  if (
    globalMasterCode &&
    timingSafeEqual(candidateDigest, digestCode(globalMasterCode))
  ) {
    // Deployment preflight rejects this state, but fail closed at runtime too if
    // database state changes afterward. Existing organization codes always win the
    // right to keep their meaning; a colliding master credential is unusable.
    const collision = await repository.findByCode(candidate);
    if (collision) {
      return {
        kind: 'organization',
        seat: { organizationId: collision.id, label: collision.name },
      };
    }
    return { kind: 'master' };
  }

  const primarySeat = configuredPrimarySeat();
  if (
    primarySeat &&
    timingSafeEqual(candidateDigest, digestCode(primarySeat.code))
  ) {
    return {
      kind: 'organization',
      seat: {
        organizationId: primarySeat.organizationId,
        label: primarySeat.label,
      },
    };
  }

  const runtimeSeat = await repository.findByCode(candidate);
  return runtimeSeat
    ? {
        kind: 'organization',
        seat: {
          organizationId: runtimeSeat.id,
          label: runtimeSeat.name,
        },
      }
    : null;
}

export async function findPreviewAccessSeatByCode(
  value: string,
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): Promise<PreviewAccessSeat | null> {
  const credential = await findPreviewAccessCredentialByCode(value, repository);
  return credential?.kind === 'organization' ? credential.seat : null;
}

async function findPreviewOrganizationAccessSeatByCode(
  value: string,
  repository: PreviewAccessSeatRepository
): Promise<PreviewAccessSeat | null> {
  if (!isPreviewAccessConfigured()) return null;
  const candidate = normalizeCode(value);
  if (!ACCESS_CODE_PATTERN.test(candidate)) return null;
  const primarySeat = configuredPrimarySeat();
  if (
    primarySeat &&
    timingSafeEqual(digestCode(candidate), digestCode(primarySeat.code))
  ) {
    return {
      organizationId: primarySeat.organizationId,
      label: primarySeat.label,
    };
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
  return (await findPreviewAccessCredentialByCode(value, repository)) !== null;
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

export function createPreviewMasterSelectionCookie() {
  const secrets = accessSecrets();
  return createCookie(PREVIEW_MASTER_SELECTION_COOKIE_NAME, {
    httpOnly: true,
    maxAge: PREVIEW_MASTER_SELECTION_MAX_AGE,
    // React Router can refresh route data through a root-level `.data` URL after the
    // action redirect. This pending token grants no app access; it only unlocks the
    // organization picker, while the actual access cookie remains the second gate.
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
  const issuedAt = Math.floor(Date.now() / 1000);
  const accessKind = seat.accessKind === 'master' ? 'master' : 'organization';
  if (accessKind === 'master') {
    const version = masterCredentialVersion();
    if (!version) {
      throw new Error('Generic preview master access is not configured.');
    }
    return createPreviewAccessCookie().serialize(
      `${MASTER_ACCESS_SEAT_VALUE_PREFIX}${issuedAt}:${seat.organizationId}:${version}`
    );
  }
  return createPreviewAccessCookie().serialize(
    `${ACCESS_SEAT_VALUE_PREFIX}${issuedAt}:${accessKind}:${seat.organizationId}`
  );
}

export async function clearPreviewAccessCookie() {
  return createPreviewAccessCookie().serialize('', { maxAge: 0 });
}

export async function grantPreviewMasterSelectionCookie() {
  if (!configuredGlobalMasterCode() || !isPreviewAccessConfigured()) {
    throw new Error('Generic preview master access is not configured.');
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const version = masterCredentialVersion();
  if (!version) {
    throw new Error('Generic preview master access is not configured.');
  }
  return createPreviewMasterSelectionCookie().serialize(
    `${MASTER_SELECTION_VALUE_PREFIX}${issuedAt}:${version}`
  );
}

export async function clearPreviewMasterSelectionCookie() {
  return createPreviewMasterSelectionCookie().serialize('', { maxAge: 0 });
}

function timestampIsCurrent(value: string, maxAge: number) {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  const issuedAt = Number(value);
  const now = Math.floor(Date.now() / 1000);
  return (
    Number.isSafeInteger(issuedAt) &&
    issuedAt <= now + ACCESS_COOKIE_CLOCK_SKEW_SECONDS &&
    now - issuedAt <= maxAge
  );
}

export async function hasPreviewMasterSelection(request: Request) {
  if (!configuredGlobalMasterCode() || !isPreviewAccessConfigured()) {
    return false;
  }
  const value = await createPreviewMasterSelectionCookie().parse(
    request.headers.get('cookie')
  );
  return (
    typeof value === 'string' &&
    value.startsWith(MASTER_SELECTION_VALUE_PREFIX) &&
    (() => {
      const payload = value.slice(MASTER_SELECTION_VALUE_PREFIX.length);
      const separator = payload.indexOf(':');
      if (separator < 1) return false;
      const version = masterCredentialVersion();
      return (
        version !== null &&
        timestampIsCurrent(
          payload.slice(0, separator),
          PREVIEW_MASTER_SELECTION_MAX_AGE
        ) &&
        payload.slice(separator + 1) === version
      );
    })()
  );
}

export async function getPreviewAccessSeat(
  request: Request,
  repository: PreviewAccessSeatRepository = databasePreviewSeatRepository
): Promise<PreviewAccessSeat | null> {
  if (!isPreviewAccessConfigured()) return null;
  const value = await createPreviewAccessCookie().parse(
    request.headers.get('cookie')
  );
  if (typeof value !== 'string') return null;

  let accessKind: 'organization' | 'master' = 'organization';
  let payload: string;
  if (value.startsWith(MASTER_ACCESS_SEAT_VALUE_PREFIX)) {
    payload = value.slice(MASTER_ACCESS_SEAT_VALUE_PREFIX.length);
    const issuedSeparator = payload.indexOf(':');
    if (issuedSeparator < 1) return null;
    if (
      !timestampIsCurrent(
        payload.slice(0, issuedSeparator),
        PREVIEW_ACCESS_MAX_AGE
      )
    ) {
      return null;
    }
    const remainder = payload.slice(issuedSeparator + 1);
    const versionSeparator = remainder.lastIndexOf(':');
    if (versionSeparator < 1) return null;
    const version = masterCredentialVersion();
    if (!version || remainder.slice(versionSeparator + 1) !== version) {
      return null;
    }
    accessKind = 'master';
    payload = remainder.slice(0, versionSeparator);
  } else if (value.startsWith(ACCESS_SEAT_VALUE_PREFIX)) {
    payload = value.slice(ACCESS_SEAT_VALUE_PREFIX.length);
    const kindSeparator = payload.indexOf(':');
    if (kindSeparator < 1) return null;
    const issuedAtValue = payload.slice(0, kindSeparator);
    if (!timestampIsCurrent(issuedAtValue, PREVIEW_ACCESS_MAX_AGE)) {
      return null;
    }
    const remainder = payload.slice(kindSeparator + 1);
    const organizationSeparator = remainder.indexOf(':');
    if (organizationSeparator < 1) return null;
    const kind = remainder.slice(0, organizationSeparator);
    if (kind !== 'organization') return null;
    payload = remainder.slice(organizationSeparator + 1);
  } else if (value.startsWith(LEGACY_ACCESS_SEAT_VALUE_PREFIX)) {
    payload = value.slice(LEGACY_ACCESS_SEAT_VALUE_PREFIX.length);
    const separator = payload.indexOf(':');
    if (separator < 1) return null;
    const issuedAtValue = payload.slice(0, separator);
    if (!timestampIsCurrent(issuedAtValue, PREVIEW_ACCESS_MAX_AGE)) {
      return null;
    }
    payload = payload.slice(separator + 1);
  } else {
    return null;
  }

  const organizationId = payload;
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)) return null;
  const primarySeat = configuredPrimarySeat();
  if (
    accessKind === 'organization' &&
    organizationId === primarySeat?.organizationId
  ) {
    return { organizationId, label: primarySeat.label };
  }
  const seat = await repository.findById(organizationId);
  if (!seat) return null;
  if (accessKind === 'organization' && !seat.previewSeatCode) return null;
  return {
    organizationId: seat.id,
    label: seat.name,
    ...(accessKind === 'master' ? { accessKind } : {}),
  };
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
 * Lets a PR-comment link log a tester straight in: `?code=<organization-code>`
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

  const seat = await findPreviewOrganizationAccessSeatByCode(code, repository);
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

function stripCodeQueryParam(request: Request): Response | null {
  if (request.method !== 'GET') return null;

  const url = new URL(request.url);
  if (!url.searchParams.has('code')) return null;

  url.searchParams.delete('code');
  return new Response(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
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
      const cleanedEntry = stripCodeQueryParam(request);
      if (cleanedEntry) return cleanedEntry;
    } else {
      // The existing seat remains authoritative, but never let a code-bearing PR link
      // linger in browser history or become a Referer after access is already granted.
      const cleanedEntry = stripCodeQueryParam(request);
      if (cleanedEntry) return cleanedEntry;
    }
    if (!seat) return blockedResponse(request);

    if (isIsolatedPreviewSeatMode()) {
      const sessionBlock = await sessionGuard(request, seat);
      if (sessionBlock) return sessionBlock;
    }
    const response = await next();
    response?.headers.set(PREVIEW_AUTHORIZED_ACTIVITY_HEADER, '1');
    return response;
  };
}

export const previewAccessMiddleware = createPreviewAccessMiddleware();

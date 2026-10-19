import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from './cookie-security.server';

export const FREE_TIER_ACCESS_COOKIE_NAME = '__yawp_free_tier_access';
export const FREE_TIER_ACCESS_MAX_AGE = 12 * 60 * 60;
type SignedPurpose = 'RELEASE' | 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
export type FreeTierPreviewGrant = {
  kind: 'acquisition' | SignedPurpose;
  issuedAt: number;
  tokenId: string;
  applicationId?: string;
};
type SessionAccess = 'anonymous' | 'teacher' | 'denied';
export type FreeTierPreviewDependencies = {
  acquisition(token: string): Promise<{ tokenId: string } | null>;
  signed(
    token: string,
    purpose: SignedPurpose
  ): Promise<{ tokenId: string; applicationId: string } | null>;
  session(
    request: Request,
    grant: FreeTierPreviewGrant
  ): Promise<SessionAccess>;
};

// Exact routes only: adding a new free-tier endpoint requires an explicit review.
const FLOW_PATHS = new Set([
  '/free',
  '/free/join',
  '/free/admin/approve',
  '/free/admin/not-right-person',
  '/join',
  '/api/free-tier/token',
  '/api/free-tier/waitlist',
  '/app/free-tier/onboarding',
  '/app/free-tier/pending',
  '/app/free-tier/preview',
  '/app/free-tier/status',
  '/app/free-tier/setup',
  '/auth/login',
  '/auth/logout',
  '/auth/required-password-change',
  '/auth/unified/google',
  '/auth/unified/google/callback',
]);
const TEACHER_LANDING_PATHS = new Set(['/app', '/app/my-classes']);
const SIGNED_ENTRIES: Record<string, SignedPurpose> = {
  '/free/join': 'RELEASE',
  '/free/admin/approve': 'ADMIN_APPROVE',
  '/free/admin/not-right-person': 'ADMIN_NOT_RIGHT_PERSON',
};

function secrets() {
  return String(process.env.PREVIEW_ACCESS_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createFreeTierAccessCookie() {
  return createCookie(FREE_TIER_ACCESS_COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    maxAge: FREE_TIER_ACCESS_MAX_AGE,
    secrets: secrets(),
  });
}

export type FreeTierPreviewSession = {
  user: {
    isAdmin: boolean;
    memberships: Array<{
      id: string;
      role: string;
      organizationId: string;
      organization: { plan: string; previewSeatCode: string | null };
    }>;
  };
  application: {
    id: string;
    acquisitionTokenId: string | null;
    organizationId: string | null;
  } | null;
};

export function classifyFreeTierPreviewSession(
  session: FreeTierPreviewSession | null,
  selectedMembershipId: string | null,
  grant: FreeTierPreviewGrant
): SessionAccess {
  const app = session?.application;
  if (!session || !app || session.user.isAdmin) return 'denied';
  if (
    grant.kind === 'acquisition'
      ? app.acquisitionTokenId !== grant.tokenId
      : app.id !== grant.applicationId
  )
    return 'denied';
  // Reject every paid/seed/admin/student membership, including stale selections.
  // This prevents a grant from carrying a seeded identity into another seat.
  const memberships = session.user.memberships;
  if (
    memberships.some(
      (m) =>
        m.role !== 'TEACHER' ||
        m.organizationId !== app.organizationId ||
        m.organization.plan !== 'FREE_CLASSROOM' ||
        m.organization.previewSeatCode
    )
  )
    return 'denied';
  if (
    selectedMembershipId &&
    !memberships.some((m) => m.id === selectedMembershipId)
  )
    return 'denied';
  return 'teacher';
}

export const freeTierPreviewDependencies: FreeTierPreviewDependencies = {
  async acquisition(token) {
    const { checkTokenValidity, findAcquisitionTokenByCredential } =
      await import('~/domain/free-tier/service.server');
    if ((await checkTokenValidity(token)).valid !== true) return null;
    const row = await findAcquisitionTokenByCredential(token);
    return row ? { tokenId: row.id } : null;
  },
  async signed(token, expectedPurpose) {
    const { peekSignedLink } =
      await import('~/domain/free-tier/signed-link.server');
    const result = await peekSignedLink({ token, expectedPurpose });
    return result.ok
      ? { tokenId: result.linkId, applicationId: result.applicationId }
      : null;
  },
  async session(request, grant) {
    const { authSessionStorage } =
      await import('../cookie-session-storages/authentication.server');
    const auth = await authSessionStorage.getSession(
      request.headers.get('cookie')
    );
    const sessionId = auth.get('sessionId');
    if (typeof sessionId !== 'string' || !sessionId) return 'anonymous';
    const [{ prisma }, { getMembershipId }] = await Promise.all([
      import('./db.server'),
      import('../cookies/membership-id.server'),
    ]);
    const session = await prisma.session.findUnique({
      where: { id: sessionId, expirationDate: { gt: new Date() } },
      select: {
        userId: true,
        user: {
          select: {
            isAdmin: true,
            memberships: {
              where: { isActive: true },
              select: {
                id: true,
                role: true,
                organizationId: true,
                organization: { select: { plan: true, previewSeatCode: true } },
              },
            },
          },
        },
      },
    });
    if (!session) return 'denied';
    const application = await prisma.freeTierApplication.findFirst({
      where: {
        userId: session.userId,
        ...(grant.kind === 'acquisition'
          ? { acquisitionTokenId: grant.tokenId }
          : { id: grant.applicationId }),
      },
      select: { id: true, acquisitionTokenId: true, organizationId: true },
    });
    return classifyFreeTierPreviewSession(
      { user: session.user, application },
      await getMembershipId(request),
      grant
    );
  },
};

function validGrant(value: unknown): value is FreeTierPreviewGrant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as FreeTierPreviewGrant;
  const now = Math.floor(Date.now() / 1000);
  return (
    [
      'acquisition',
      'RELEASE',
      'ADMIN_APPROVE',
      'ADMIN_NOT_RIGHT_PERSON',
    ].includes(grant.kind) &&
    Number.isSafeInteger(grant.issuedAt) &&
    grant.issuedAt > 0 &&
    grant.issuedAt <= now + 300 &&
    now - grant.issuedAt <= FREE_TIER_ACCESS_MAX_AGE &&
    typeof grant.tokenId === 'string' &&
    grant.tokenId.length > 0 &&
    grant.tokenId.length <= 128 &&
    (grant.kind === 'acquisition' ||
      (typeof grant.applicationId === 'string' &&
        grant.applicationId.length > 0 &&
        grant.applicationId.length <= 128))
  );
}

/** Called only inside the enabled preview gate, after ordinary seat access. */
export async function freeTierPreviewAccess(
  request: Request,
  dependencies: FreeTierPreviewDependencies
): Promise<{ setCookie?: string } | null> {
  if (!secrets().length) return null;
  const { hasImpersonationCookie } =
    await import('./internal-impersonation-http.server');
  if (hasImpersonationCookie(request)) return null;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\.data$/, '').replace(/\/$/, '');
  const read = request.method === 'GET' || request.method === 'HEAD';
  // Manifest discovery contains route metadata only; it executes no loaders/actions.
  const manifest = pathname === '/__manifest' && read;
  if (
    !FLOW_PATHS.has(pathname) &&
    !TEACHER_LANDING_PATHS.has(pathname) &&
    !manifest
  )
    return null;

  let grant: FreeTierPreviewGrant | null = null;
  let fresh = false;
  const token = url.searchParams.get('t')?.trim();
  if (read && token && token.length <= 500) {
    const purpose = SIGNED_ENTRIES[pathname];
    const validated =
      pathname === '/free'
        ? await dependencies.acquisition(token)
        : purpose
          ? await dependencies.signed(token, purpose)
          : null;
    if (validated) {
      grant = {
        kind: purpose ?? 'acquisition',
        issuedAt: Math.floor(Date.now() / 1000),
        ...validated,
      };
      fresh = true;
    }
  }
  if (!grant) {
    const parsed: unknown = await createFreeTierAccessCookie().parse(
      request.headers.get('cookie')
    );
    if (validGrant(parsed)) grant = parsed;
  }
  if (!grant) return null;
  const session = await dependencies.session(request, grant);
  if (
    session === 'denied' ||
    (TEACHER_LANDING_PATHS.has(pathname) && session !== 'teacher')
  )
    return null;
  // Do not re-peek consumed join/approval links, or recheck a cap after redemption:
  // this bounded continuation is needed to finish the flow that consumed the link.
  return fresh
    ? { setCookie: await createFreeTierAccessCookie().serialize(grant) }
    : {};
}

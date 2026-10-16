import { createHash } from 'node:crypto';
import { createCookie } from 'react-router';
import type { Prisma } from '@app/prisma';
import { prisma } from './db.server';
import { shouldUseSecureCookies } from './cookie-security.server';
import { assertPreviewSignonTarget } from './preview-signon-target.server';
import {
  createPreviewAccessCookie,
  getPreviewAccessSeat,
  isIsolatedPreviewSeatMode,
  isPreviewAccessConfigured,
} from './preview-access.server';
import { isUnifiedSignOnEnabled } from '~/domain/unified-signon/gate.server';

export const PREVIEW_SIGNON_QA_COOKIE = '__yawp_preview_signon_qa';
export const PREVIEW_SIGNON_QA_MAX_AGE = 600;
export const PREVIEW_SIGNON_QA_ACCOUNTS = [
  'multiple',
  'inactive',
  'orphan',
  'unassigned',
] as const;
const organizations = ['school', 'second', 'free', 'partner'].map(
  (k) => `preview-signon-qa-${k}`
);
type Client = Prisma.TransactionClient;
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function createPreviewSignonQaCookie() {
  const secrets = String(process.env.PREVIEW_ACCESS_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return createCookie(PREVIEW_SIGNON_QA_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: PREVIEW_SIGNON_QA_MAX_AGE,
    secure: shouldUseSecureCookies(),
    secrets: secrets.length ? secrets : ['preview-access-unconfigured'],
  });
}
export const clearPreviewSignonQaContext = () =>
  createPreviewSignonQaCookie().serialize('', { maxAge: 0 });

/** Fail closed before DB access outside an isolated, enabled, seed-mode PR target. */
export async function previewSignonQaAvailable(db: Client = prisma) {
  try {
    const target = assertPreviewSignonTarget()!;
    if (
      !isIsolatedPreviewSeatMode() ||
      !isPreviewAccessConfigured() ||
      !(await isUnifiedSignOnEnabled())
    )
      return false;
    const [actual] = await db.$queryRaw<
      { database: string; role: string }[]
    >`SELECT current_database() AS database, current_user AS role`;
    return actual?.database === target.database && actual?.role === target.role;
  } catch {
    return false;
  }
}
async function eligibleAccount(account: string, db: Client) {
  if (!PREVIEW_SIGNON_QA_ACCOUNTS.some((k) => k === account)) return false;
  const user = await db.user.findUnique({
    where: { id: `preview-signon-qa-${account}` },
    select: {
      email: true,
      username: true,
      isAdmin: true,
      memberships: { select: { organizationId: true } },
    },
  });
  return (
    !!user &&
    user.email === `${account}@signon.preview.yawp.invalid` &&
    !user.username &&
    !user.isAdmin &&
    user.memberships.every((m) => organizations.includes(m.organizationId))
  );
}
/** Called only after the access action verifies a current master-selection token.
 * This grants fixture context, never account proof or a session. */
export async function grantPreviewSignonQaContext(
  account: string,
  accessCookie: string,
  db: Client = prisma
) {
  if (
    !(await previewSignonQaAvailable(db)) ||
    !(await eligibleAccount(account, db))
  )
    return null;
  const access = await createPreviewAccessCookie().parse(
    accessCookie.split(';')[0]
  );
  if (typeof access !== 'string') return null;
  return createPreviewSignonQaCookie().serialize({
    version: 1,
    issuedAt: Math.floor(Date.now() / 1000),
    account,
    database: assertPreviewSignonTarget()!.database,
    access: digest(access),
  });
}
/** Authorization for one disposable account, bound to the live master seat and
 * database. Every caller still performs ordinary password/proof and ownership checks. */
export async function hasPreviewSignonQaContext(
  request: Request,
  userId: string,
  db: Client = prisma
): Promise<boolean> {
  try {
    const value = await createPreviewSignonQaCookie().parse(
      request.headers.get('cookie')
    );
    if (
      !value ||
      value.version !== 1 ||
      `preview-signon-qa-${value.account}` !== userId ||
      !Number.isSafeInteger(value.issuedAt) ||
      value.issuedAt > Math.floor(Date.now() / 1000) + 5 ||
      Math.floor(Date.now() / 1000) - value.issuedAt >
        PREVIEW_SIGNON_QA_MAX_AGE ||
      !(await previewSignonQaAvailable(db)) ||
      value.database !== assertPreviewSignonTarget()!.database
    )
      return false;
    const seat = await getPreviewAccessSeat(request);
    const access = await createPreviewAccessCookie().parse(
      request.headers.get('cookie')
    );
    if (
      seat?.accessKind !== 'master' ||
      seat.organizationId !== 'preview-signon-qa-school' ||
      typeof access !== 'string' ||
      value.access !== digest(access)
    )
      return false;
    return await eligibleAccount(value.account, db);
  } catch {
    return false;
  }
}

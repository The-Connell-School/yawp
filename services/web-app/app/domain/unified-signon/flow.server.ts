import { createHash, randomBytes } from 'node:crypto';
import { createCookie } from 'react-router';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';
import { identifierKind, type SignonState } from './contracts';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const opaque = () => randomBytes(32).toString('base64url');
export const flowCookie = createCookie('yawp_signon', {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 1800,
  secure: shouldUseSecureCookies(),
  secrets: process.env.SESSION_SECRET.split(','),
});
export type FlowData = {
  state: SignonState;
  destination: string;
  identifier?: string;
  userId?: string;
  classId?: string;
  classCandidates?: string[];
  classCode?: string;
  joinToken?: string;
  partner?: boolean;
  partnerEntry?: boolean;
  invitationId?: string;
  legacyOrganizationId?: string;
  proof?: 'email' | 'google' | 'password';
  purpose?: 'signin' | 'reset' | 'signup' | 'trial';
  otp?: {
    hash: string;
    generation: string;
    expires: number;
    attempts: number;
    sent: number;
  };
  google?: {
    state: string;
    nonce: string;
    verifier: string;
    callback: string;
    linkUserId?: string;
  };
  pendingGoogle?: { subject: string; email: string };
  completed?: boolean;
};
export type Flow = {
  id: string;
  token: string;
  browser: string;
  data: FlowData;
};
export class FlowError extends Error {
  constructor(
    message = 'This sign-in session expired. Please start again.',
    readonly status = 400,
    readonly retryAfterSeconds?: number,
    readonly fieldErrors?: Record<string, string>
  ) {
    super(message);
  }
}
export async function browserContext(
  request: Request
): Promise<{ browser: string; token: string } | null> {
  const value = await flowCookie.parse(request.headers.get('cookie'));
  return value &&
    typeof value.browser === 'string' &&
    typeof value.token === 'string'
    ? value
    : null;
}
export async function createFlow(
  request: Request,
  destination: string
): Promise<Flow> {
  const current = await browserContext(request);
  const token = opaque();
  const browser = current?.browser || opaque();
  const data: FlowData = { destination, state: { screen: 'entry' } };
  const id = digest(token);
  await prisma.signonFlow.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  await prisma.signonFlow.create({
    data: {
      id,
      browserHash: digest(browser),
      expiresAt: new Date(Date.now() + 1800000),
      data: data as Prisma.InputJsonValue,
    },
  });
  return { id, token, browser, data };
}
export async function withFlow<T>(
  request: Request,
  token: string | undefined,
  operation: (flow: Flow, tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const context = await browserContext(request);
  if (!context || !token || token.length > 100 || context.token !== token)
    throw new FlowError();
  return prisma.$transaction(
    async (tx) => {
      const id = digest(token);
      await tx.$queryRaw`SELECT "id" FROM "SignonFlow" WHERE "id" = ${id} FOR UPDATE`;
      const row = await tx.signonFlow.findUnique({ where: { id } });
      if (
        !row ||
        row.browserHash !== digest(context.browser) ||
        row.expiresAt.getTime() <= Date.now()
      )
        throw new FlowError();
      const flow: Flow = {
        id,
        token,
        browser: context.browser,
        data: row.data as unknown as FlowData,
      };
      if (flow.data.completed) throw new FlowError();
      const result = await operation(flow, tx);
      await tx.signonFlow.update({
        where: { id },
        data: { data: flow.data as unknown as Prisma.InputJsonValue },
      });
      return result;
    },
    { timeout: 20000 }
  );
}
export async function saveNewFlow(flow: Flow) {
  await prisma.signonFlow.update({
    where: { id: flow.id },
    data: { data: flow.data as unknown as Prisma.InputJsonValue },
  });
}
export function stateFor(flow: Flow, state: SignonState) {
  const classInfo =
    flow.data.classId && flow.data.state.classInfo?.id === flow.data.classId
      ? flow.data.state.classInfo
      : undefined;
  flow.data.state = {
    ...(classInfo ? { classInfo } : {}),
    ...state,
    ...(state.screen === 'class-handle'
      ? {
          emailOrigin:
            identifierKind(flow.data.identifier ?? '') === 'email' &&
            flow.data.proof !== 'google' &&
            !flow.data.pendingGoogle,
        }
      : {}),
    ...(flow.data.proof === 'google' ? { provider: 'google' as const } : {}),
    flowToken: flow.token,
  };
  return { state: flow.data.state };
}

/** A challenge cannot follow an address/handle after it is reassigned. Lock the
 * originally resolved account while proving it, then compare current ownership. */
export async function assertCurrentIdentity(
  tx: Prisma.TransactionClient,
  flow: Flow
) {
  if (!flow.data.identifier) throw new FlowError();
  if (flow.data.userId)
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${flow.data.userId} FOR UPDATE`;
  const identifier = flow.data.identifier;
  const current = await tx.user.findFirst({
    where: identifier.startsWith('@')
      ? { username: identifier.slice(1) }
      : { email: { equals: identifier, mode: 'insensitive' } },
    select: { id: true },
  });
  if (current?.id !== flow.data.userId)
    throw new FlowError('Your account changed. Please start sign-in again.');
}

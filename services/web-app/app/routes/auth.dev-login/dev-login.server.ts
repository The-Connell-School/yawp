import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { combineHeaders } from '~/utils/misc';
import {
  LOCAL_DEV_PERSONA_EMAILS,
  LOCAL_DEV_PERSONAS,
} from '../../../../../packages/prisma/scripts/local-dev/dev-personas';

type PreviewSeat = { organizationId: string; label: string };

export type DevLoginOption = {
  email: string;
  label: string;
  description: string;
  role: string;
};

export type DevLoginOptionsPage = {
  options: DevLoginOption[];
  nextCursor: number | null;
};

export const DEV_LOGIN_OPTIONS_PAGE_SIZE = 20;

export type DevLoginDependencies = {
  prismaClient: any;
  getExpirationDate: () => Date;
  sessionKey: string;
  sessionStorage: any;
  membershipCookie: (membershipId: string) => Promise<string>;
  localDevAuthEnabled: () => boolean;
  previewGateEnabled: () => boolean;
  previewSeatForRequest: (request: Request) => Promise<PreviewSeat | null>;
  redirectResponse: (headers: Headers) => Response;
};

export type DevLoginOptionsDependencies = Pick<
  DevLoginDependencies,
  | 'prismaClient'
  | 'localDevAuthEnabled'
  | 'previewGateEnabled'
  | 'previewSeatForRequest'
>;

function forbidden() {
  return Response.json({ error: 'Dev login is disabled.' }, { status: 403 });
}

export function createDevLoginAction({
  prismaClient,
  getExpirationDate,
  sessionKey,
  sessionStorage,
  membershipCookie,
  localDevAuthEnabled,
  previewGateEnabled,
  previewSeatForRequest,
  redirectResponse,
}: DevLoginDependencies) {
  return async ({ request }: ActionFunctionArgs) => {
    if (!localDevAuthEnabled()) return forbidden();

    const formData = await request.formData();
    const email = String(formData.get('email') ?? '')
      .trim()
      .toLowerCase();
    const gateEnabled = previewGateEnabled();
    const previewSeat = gateEnabled
      ? await previewSeatForRequest(request)
      : null;
    // The master access flow binds its cookie to one selected organization before this
    // route can run. Sanitized-production previews must honor that same boundary.

    if (gateEnabled && !previewSeat) {
      return Response.json(
        { error: 'Preview access code required.' },
        { status: 401 }
      );
    }
    if (!gateEnabled && !LOCAL_DEV_PERSONA_EMAILS.includes(email)) {
      return Response.json({ error: 'Unknown dev persona.' }, { status: 404 });
    }

    const user =
      previewSeat
        ? await prismaClient.user.findFirst({
            where: {
              email,
              memberships: {
                some: { isActive: true, organizationId: previewSeat.organizationId },
              },
            },
            select: {
              id: true,
              memberships: {
                where: { isActive: true, organizationId: previewSeat.organizationId },
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          })
        : await prismaClient.user.findUnique({
            where: { email },
            select: {
              id: true,
              memberships: {
                where: { isActive: true },
                select: { id: true, role: true },
                orderBy: { createdAt: 'asc' },
                take: 1,
              },
            },
          });

    if (!user || !user.memberships[0]) {
      return Response.json(
        {
          error:
            previewSeat
              ? 'No user with that email belongs to this preview seat.'
              : 'Dev persona missing. Run `bun db:seed-local-dev` first.',
        },
        { status: 404 }
      );
    }

    const session = await prismaClient.session.create({
      select: { id: true, expirationDate: true, userId: true },
      data: {
        expirationDate: getExpirationDate(),
        userId: user.id,
      },
    });

    const membershipId = user.memberships[0]?.id ?? '';
    const authSession = await sessionStorage.getSession(
      request.headers.get('cookie')
    );
    const previousSessionId = authSession.get(sessionKey);
    if (previousSessionId) {
      void prismaClient.session.deleteMany({
        where: { id: previousSessionId },
      });
    }
    authSession.set(sessionKey, session.id);
    authSession.unset('impersonationMode');
    authSession.unset('impersonatorUserId');

    return redirectResponse(
      combineHeaders(
        { Location: '/app' },
        {
          'set-cookie': await sessionStorage.commitSession(authSession, {
            expires: session.expirationDate,
          }),
        },
        { 'set-cookie': await membershipCookie(membershipId) }
      )
    );
  };
}

export function createDevLoginOptionsLoader({
  prismaClient,
  localDevAuthEnabled,
  previewGateEnabled,
  previewSeatForRequest,
}: DevLoginOptionsDependencies) {
  return async ({ request }: LoaderFunctionArgs) => {
    if (!localDevAuthEnabled()) return forbidden();

    const gateEnabled = previewGateEnabled();
    const previewSeat = gateEnabled
      ? await previewSeatForRequest(request)
      : null;
    if (gateEnabled && !previewSeat) {
      return Response.json(
        { error: 'Preview access code required.' },
        { status: 401 }
      );
    }

    const cursorValue = new URL(request.url).searchParams.get('cursor');
    const cursor =
      cursorValue && /^\d+$/.test(cursorValue) ? Number(cursorValue) : 0;
    const page = await getLocalDevLoginOptionsPage(
      previewSeat?.organizationId,
      prismaClient,
      {
        cursor,
      }
    );

    return Response.json(page);
  };
}

function toDevLoginOption(user: any): DevLoginOption | null {
  const membership = user.memberships[0];
  if (!membership) return null;
  const role = user.isAdmin
    ? 'admin'
    : membership.isOrgOwner
      ? 'owner'
      : membership.role === 'STUDENT'
        ? 'student'
        : 'teacher';
  const roleLabel =
    role === 'admin'
      ? 'Admin'
      : role === 'owner'
        ? 'Org owner'
        : role === 'student'
          ? 'Student'
          : 'Teacher';
  return {
    email: user.email,
    label: user.name?.trim() || user.email,
    description: `${roleLabel} in this preview seat.`,
    role,
  };
}

export async function getLocalDevLoginOptionsPage(
  organizationId: string | undefined,
  prismaClient: any,
  options: { cursor?: number } = {}
): Promise<DevLoginOptionsPage> {
  const cursor = Math.max(0, options.cursor ?? 0);

  if (!organizationId) {
    const pageOptions = LOCAL_DEV_PERSONAS.slice(
      cursor,
      cursor + DEV_LOGIN_OPTIONS_PAGE_SIZE
    ).map((persona) => ({
      email: persona.email,
      label: persona.label,
      description: persona.description,
      role: persona.key,
    }));
    const nextCursor =
      cursor + pageOptions.length < LOCAL_DEV_PERSONAS.length
        ? cursor + pageOptions.length
        : null;
    return { options: pageOptions, nextCursor };
  }

  const users = await prismaClient.user.findMany({
    where: {
      memberships: {
        some: { isActive: true, organizationId },
      },
    },
    select: {
      email: true,
      name: true,
      isAdmin: true,
      memberships: {
        where: { isActive: true, organizationId },
        select: { role: true, isOrgOwner: true },
        take: 1,
      },
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    skip: cursor,
    take: DEV_LOGIN_OPTIONS_PAGE_SIZE,
  });
  const pageOptions = users.flatMap((user: any): DevLoginOption[] => {
    const option = toDevLoginOption(user);
    return option ? [option] : [];
  });
  return {
    options: pageOptions,
    nextCursor:
      users.length === DEV_LOGIN_OPTIONS_PAGE_SIZE
        ? cursor + users.length
        : null,
  };
}

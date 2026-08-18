import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';
import { safeRedirect } from 'remix-utils/safe-redirect';
import {
  PREVIEW_ACCESS_PATH,
  clearPreviewAccessCookie,
  clearPreviewMasterSelectionCookie,
  findPreviewAccessCredentialByCode,
  grantPreviewAccessCookie,
  grantPreviewMasterSelectionCookie,
  hasPreviewMasterSelection,
  isPreviewAccessConfigured,
  type PreviewAccessCredential,
  type PreviewAccessSeat,
} from '~/utils/preview-access.server';

/**
 * Kept out of route.tsx on purpose.
 *
 * React Router strips standard server-only route exports from the client bundle, but it
 * cannot strip extra named factories. Keeping the dependency injection here makes the
 * access flow testable without pulling database code into the browser build.
 */
type LogoutFunction = typeof import('~/utils/auth.server').logout;

type PreviewOrganization = { id: string; name: string };

type PreviewAccessRouteDependencies = {
  logoutFunction?: LogoutFunction;
  findCredential?: (code: string) => Promise<PreviewAccessCredential | null>;
  masterSelectionForRequest?: (request: Request) => Promise<boolean>;
  grantMasterSelection?: () => Promise<string>;
  clearMasterSelection?: () => Promise<string>;
  grantAccess?: (seat: PreviewAccessSeat) => Promise<string>;
  clearAccess?: () => Promise<string>;
  findOrganization?: (id: string) => Promise<PreviewOrganization | null>;
  listOrganizations?: () => Promise<PreviewOrganization[]>;
};

async function databaseFindOrganization(id: string) {
  const { prisma } = await import('~/utils/db.server.ts');
  return prisma.organization.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
}

async function databaseListOrganizations() {
  const { prisma } = await import('~/utils/db.server.ts');
  return prisma.organization.findMany({
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

function selectionUrl(returnTo: string) {
  return `${PREVIEW_ACCESS_PATH}?${new URLSearchParams({ returnTo })}`;
}

function cookieHeaders(...cookies: string[]) {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return headers;
}

export function createPreviewAccessLoader(
  dependencies: PreviewAccessRouteDependencies = {}
) {
  const masterSelectionForRequest =
    dependencies.masterSelectionForRequest ?? hasPreviewMasterSelection;
  const listOrganizations =
    dependencies.listOrganizations ?? databaseListOrganizations;

  return async ({ request }: LoaderFunctionArgs) => {
    const returnTo = safeRedirect(
      new URL(request.url).searchParams.get('returnTo') ?? '',
      '/'
    );
    const configured = isPreviewAccessConfigured();
    const masterSelection =
      configured && (await masterSelectionForRequest(request));
    return {
      configured,
      masterSelection,
      organizations: masterSelection ? await listOrganizations() : [],
      returnTo,
    };
  };
}

export function createPreviewAccessAction(
  dependencies: PreviewAccessRouteDependencies = {}
) {
  const findCredential =
    dependencies.findCredential ?? findPreviewAccessCredentialByCode;
  const masterSelectionForRequest =
    dependencies.masterSelectionForRequest ?? hasPreviewMasterSelection;
  const grantMasterSelection =
    dependencies.grantMasterSelection ?? grantPreviewMasterSelectionCookie;
  const clearMasterSelection =
    dependencies.clearMasterSelection ?? clearPreviewMasterSelectionCookie;
  const grantAccess = dependencies.grantAccess ?? grantPreviewAccessCookie;
  const clearAccess = dependencies.clearAccess ?? clearPreviewAccessCookie;
  const findOrganization =
    dependencies.findOrganization ?? databaseFindOrganization;

  return async ({ request }: ActionFunctionArgs): Promise<Response> => {
    const formData = await request.formData();
    const intent = String(formData.get('intent') ?? 'enter');
    const returnTo = safeRedirect(
      String(formData.get('returnTo') ?? ''),
      '/'
    );
    const signOut =
      dependencies.logoutFunction ??
      (await import('~/utils/auth.server')).logout;

    if (intent === 'sign-out' || intent === 'cancel-master') {
      await signOut(
        { request, redirectTo: PREVIEW_ACCESS_PATH },
        {
          headers: cookieHeaders(
            await clearAccess(),
            await clearMasterSelection()
          ),
        }
      );
      throw new Error('Preview access sign-out did not redirect.');
    }

    if (!isPreviewAccessConfigured()) {
      return Response.json(
        {
          error:
            'Preview access is not configured. Contact the deployment owner.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (intent === 'select-organization') {
      if (!(await masterSelectionForRequest(request))) {
        return Response.json(
          { error: 'Enter the master access code before choosing an organization.' },
          { status: 401, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const organizationId = String(formData.get('organizationId') ?? '');
      const organization = /^[a-z0-9][a-z0-9-]{0,127}$/.test(organizationId)
        ? await findOrganization(organizationId)
        : null;
      if (!organization) {
        return Response.json(
          { error: 'Choose a valid organization.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }

      await signOut(
        { request, redirectTo: returnTo },
        {
          headers: cookieHeaders(
            await grantAccess({
              organizationId: organization.id,
              label: organization.name,
              accessKind: 'master',
            }),
            await clearMasterSelection()
          ),
        }
      );
      throw new Error('Preview organization selection did not redirect.');
    }

    const code = String(formData.get('code') ?? '');
    const credential = await findCredential(code);
    if (!credential) {
      return Response.json(
        { error: 'That access code was not recognized.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (credential.kind === 'master') {
      await signOut(
        { request, redirectTo: selectionUrl(returnTo) },
        {
          headers: cookieHeaders(
            await grantMasterSelection(),
            await clearAccess()
          ),
        }
      );
      throw new Error('Preview master access did not redirect.');
    }

    // A code switch must not leave an application login from the previous seat alive.
    await signOut(
      { request, redirectTo: returnTo },
      {
        headers: cookieHeaders(
          await grantAccess(credential.seat),
          await clearMasterSelection()
        ),
      }
    );
    throw new Error('Preview access entry did not redirect.');
  };
}

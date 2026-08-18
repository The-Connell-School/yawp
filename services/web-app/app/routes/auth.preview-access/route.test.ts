import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const logout = mock();
const findCredential = mock();
const masterSelectionForRequest = mock();
const grantMasterSelection = mock();
const clearMasterSelection = mock();
const grantAccess = mock();
const clearAccess = mock();
const findOrganization = mock();
const listOrganizations = mock();
const { createPreviewAccessAction, createPreviewAccessLoader } = await import(
  './action.server'
);
const dependencies = {
  logoutFunction: logout as never,
  findCredential: findCredential as never,
  masterSelectionForRequest: masterSelectionForRequest as never,
  grantMasterSelection: grantMasterSelection as never,
  clearMasterSelection: clearMasterSelection as never,
  grantAccess: grantAccess as never,
  clearAccess: clearAccess as never,
  findOrganization: findOrganization as never,
  listOrganizations: listOrganizations as never,
};
const action = createPreviewAccessAction(dependencies);
const loader = createPreviewAccessLoader(dependencies);

const originalCodes = process.env.PREVIEW_ACCESS_CODES;
const originalSeats = process.env.PREVIEW_ACCESS_SEATS;
const originalSecret = process.env.PREVIEW_ACCESS_SECRET;

function makeRequest(fields: Record<string, string>) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  return new Request('https://preview.yawp.school/auth/preview-access', {
    method: 'POST',
    body,
  });
}

function actionArgs(request: Request) {
  return {
    request,
    params: {},
    context: {} as never,
    url: new URL(request.url),
    pattern: '/auth/preview-access',
  } as Parameters<typeof action>[0];
}

describe('preview access action', () => {
  beforeEach(() => {
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    logout.mockReset();
    findCredential.mockReset();
    masterSelectionForRequest.mockReset();
    grantMasterSelection.mockReset();
    clearMasterSelection.mockReset();
    grantAccess.mockReset();
    clearAccess.mockReset();
    findOrganization.mockReset();
    listOrganizations.mockReset();
    findCredential.mockImplementation(async (code: string) =>
      code.trim().toLowerCase() === 'brave-otter-4193'
        ? {
            kind: 'organization',
            seat: { organizationId: 'local-dev-org', label: 'Yawp Local Dev' },
          }
        : null
    );
    masterSelectionForRequest.mockResolvedValue(false);
    grantMasterSelection.mockResolvedValue(
      '__yawp_preview_master=master; Path=/; HttpOnly'
    );
    clearMasterSelection.mockResolvedValue(
      '__yawp_preview_master=; Path=/; Max-Age=0'
    );
    grantAccess.mockResolvedValue(
      '__yawp_preview_access=seat; Path=/; HttpOnly'
    );
    clearAccess.mockResolvedValue(
      '__yawp_preview_access=; Path=/; Max-Age=0'
    );
    findOrganization.mockResolvedValue(null);
    listOrganizations.mockResolvedValue([]);
    logout.mockImplementation((_options, responseInit) => {
      throw new Response(null, { status: 302, ...responseInit });
    });
  });

  afterEach(() => {
    if (originalCodes === undefined)
      Reflect.deleteProperty(process.env, 'PREVIEW_ACCESS_CODES');
    else process.env.PREVIEW_ACCESS_CODES = originalCodes;
    if (originalSeats === undefined)
      Reflect.deleteProperty(process.env, 'PREVIEW_ACCESS_SEATS');
    else process.env.PREVIEW_ACCESS_SEATS = originalSeats;
    if (originalSecret === undefined)
      Reflect.deleteProperty(process.env, 'PREVIEW_ACCESS_SECRET');
    else process.env.PREVIEW_ACCESS_SECRET = originalSecret;
  });

  test('accepts a configured code and returns to the requested app page', async () => {
    let response: Response | undefined;
    try {
      await action(
        actionArgs(
          makeRequest({
            code: 'Brave-Otter-4193',
            returnTo: '/app/classes?tab=active',
          })
        )
      );
    } catch (error) {
      response = error as Response;
    }

    expect(response?.status).toBe(302);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout.mock.calls[0]?.[0].redirectTo).toBe(
      '/app/classes?tab=active'
    );
    expect(
      new Headers(logout.mock.calls[0]?.[1]?.headers).get('set-cookie')
    ).toContain(
      '__yawp_preview_access='
    );
  });

  test('rejects an invalid code without setting a cookie', async () => {
    const response = await action(
      actionArgs(makeRequest({ code: 'wrong-otter-4193' }))
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({
      error: 'That access code was not recognized.',
    });
  });

  test('awaits runtime DB seat resolution before setting the cookie', async () => {
    findCredential.mockResolvedValue({
      kind: 'organization',
      seat: {
        organizationId: 'preview-seat-2',
        label: 'Yawp Preview - Seat 2',
      },
    });

    let response: Response | undefined;
    try {
      await action(
        actionArgs(
          makeRequest({
            code: 'calm-panda-8127',
            returnTo: '/app',
          })
        )
      );
    } catch (error) {
      response = error as Response;
    }

    expect(findCredential).toHaveBeenCalledWith('calm-panda-8127');
    expect(response?.status).toBe(302);
    expect(
      new Headers(logout.mock.calls[0]?.[1]?.headers).get('set-cookie')
    ).toContain(
      '__yawp_preview_access='
    );
  });

  test('master code creates only a pending organization-selection session', async () => {
    findCredential.mockResolvedValue({ kind: 'master' });

    let response: Response | undefined;
    try {
      await action(
        actionArgs(
          makeRequest({
            code: 'wise-owl-9876',
            returnTo: '/app/classes?tab=active',
          })
        )
      );
    } catch (error) {
      response = error as Response;
    }

    expect(response?.status).toBe(302);
    expect(logout.mock.calls[0]?.[0].redirectTo).toBe(
      '/auth/preview-access?returnTo=%2Fapp%2Fclasses%3Ftab%3Dactive'
    );
    const setCookie = new Headers(
      logout.mock.calls[0]?.[1]?.headers
    ).get('set-cookie');
    expect(setCookie).toContain('__yawp_preview_master=master');
    expect(setCookie).toContain('__yawp_preview_access=');
    expect(grantAccess).not.toHaveBeenCalled();
  });

  test('master selection binds access to the chosen organization', async () => {
    masterSelectionForRequest.mockResolvedValue(true);
    findOrganization.mockResolvedValue({
      id: 'another-org',
      name: 'Another Organization',
    });

    let response: Response | undefined;
    try {
      await action(
        actionArgs(
          makeRequest({
            intent: 'select-organization',
            organizationId: 'another-org',
            returnTo: '/app/classes',
          })
        )
      );
    } catch (error) {
      response = error as Response;
    }

    expect(response?.status).toBe(302);
    expect(findOrganization).toHaveBeenCalledWith('another-org');
    expect(grantAccess).toHaveBeenCalledWith({
      organizationId: 'another-org',
      label: 'Another Organization',
      accessKind: 'master',
    });
    const setCookie = new Headers(
      logout.mock.calls[0]?.[1]?.headers
    ).get('set-cookie');
    expect(setCookie).toContain('__yawp_preview_access=seat');
    expect(setCookie).toContain('__yawp_preview_master=');
  });

  test('does not expose organization names until the master code is accepted', async () => {
    const request = new Request(
      'https://preview.yawp.school/auth/preview-access?returnTo=%2Fapp'
    );

    expect(await loader({ request } as never)).toEqual({
      configured: true,
      masterSelection: false,
      organizations: [],
      returnTo: '/app',
    });
    expect(listOrganizations).not.toHaveBeenCalled();

    masterSelectionForRequest.mockResolvedValue(true);
    listOrganizations.mockResolvedValue([
      { id: 'another-org', name: 'Another Organization' },
    ]);
    expect(await loader({ request } as never)).toEqual({
      configured: true,
      masterSelection: true,
      organizations: [
        { id: 'another-org', name: 'Another Organization' },
      ],
      returnTo: '/app',
    });
  });

  test('fails closed when no codes are configured', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    delete process.env.PREVIEW_ACCESS_CODES;

    const response = await action(
      actionArgs(makeRequest({ code: 'brave-otter-4193' }))
    );

    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({
      error: 'Preview access is not configured. Contact the deployment owner.',
    });
  });

  test('re-enter-code clears both access and application auth sessions', async () => {
    logout.mockImplementation((_options, responseInit) => {
      throw new Response(null, { status: 302, ...responseInit });
    });

    let response: Response | undefined;
    try {
      await action(actionArgs(makeRequest({ intent: 'sign-out' })));
    } catch (error) {
      response = error as Response;
    }

    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout.mock.calls[0]?.[0].redirectTo).toBe('/auth/preview-access');
    expect(response?.status).toBe(302);
  });
});

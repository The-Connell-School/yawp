import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const logout = mock();
const { createPreviewAccessAction } = await import('./route');
const action = createPreviewAccessAction(logout as never);

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
        label: 'Brian Connell',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    logout.mockReset();
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
          }),
        ),
      );
    } catch (error) {
      response = error as Response;
    }

    expect(response?.status).toBe(302);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(logout.mock.calls[0]?.[0].redirectTo).toBe(
      '/app/classes?tab=active',
    );
    expect(logout.mock.calls[0]?.[1]?.headers['set-cookie']).toContain(
      '__yawp_preview_access=',
    );
  });

  test('rejects an invalid code without setting a cookie', async () => {
    const response = await action(
      actionArgs(makeRequest({ code: 'wrong-otter-4193' })),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.json()).toEqual({
      error: 'That access code was not recognized.',
    });
  });

  test('fails closed when no codes are configured', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    delete process.env.PREVIEW_ACCESS_CODES;

    const response = await action(
      actionArgs(makeRequest({ code: 'brave-otter-4193' })),
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

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { adaptPreviewIngressRequest } from '~/domain/unified-signon/origin.server';

const logout = mock();
const findCredential = mock();
const masterSelectionForRequest = mock();
const grantMasterSelection = mock();
const clearMasterSelection = mock();
const grantAccess = mock();
const clearAccess = mock();
const findOrganization = mock();
const listOrganizations = mock();
const checkAttemptAllowed = mock();
const recordFailedAttempt = mock();
const clearFailedAttempts = mock();

const { createPreviewAccessAction } = await import('./action.server');

const action = createPreviewAccessAction({
  logoutFunction: logout as never,
  findCredential: findCredential as never,
  masterSelectionForRequest: masterSelectionForRequest as never,
  grantMasterSelection: grantMasterSelection as never,
  clearMasterSelection: clearMasterSelection as never,
  grantAccess: grantAccess as never,
  clearAccess: clearAccess as never,
  findOrganization: findOrganization as never,
  listOrganizations: listOrganizations as never,
  checkAttemptAllowed: checkAttemptAllowed as never,
  recordFailedAttempt: recordFailedAttempt as never,
  clearFailedAttempts: clearFailedAttempts as never,
});

const saved = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PRIMARY_APP_URL: process.env.PRIMARY_APP_URL,
  PREVIEW_ACCESS_SEATS: process.env.PREVIEW_ACCESS_SEATS,
  PREVIEW_ACCESS_SECRET: process.env.PREVIEW_ACCESS_SECRET,
  PREVIEW_MASTER_ACCESS_CODE: process.env.PREVIEW_MASTER_ACCESS_CODE,
};

beforeEach(() => {
  process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
    { code: 'yawp-rocks', organizationId: 'local-dev-org', label: 'Master' },
  ]);
  process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
  process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
  process.env.YAWP_ENVIRONMENT = 'preview';
  process.env.PRIMARY_APP_URL = 'https://pr-848.preview.yawp.school';
  logout.mockReset();
  findCredential.mockReset();
  masterSelectionForRequest.mockResolvedValue(false);
  grantMasterSelection.mockResolvedValue(
    '__yawp_preview_master=master; Path=/; HttpOnly'
  );
  checkAttemptAllowed.mockReturnValue({ allowed: true, retryAfter: 0 });
  findCredential.mockResolvedValue({ kind: 'master' });
  logout.mockImplementation((_options, responseInit) => {
    throw new Response(null, { status: 302, ...responseInit });
  });
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test('HTTPS browser Origin reaches preview-access after ingress request adaptation', async () => {
  const body = new FormData();
  body.set('code', 'yawp-rocks');
  body.set('returnTo', '/');
  const request = adaptPreviewIngressRequest(
    new Request('http://pr-848.preview.yawp.school/auth/preview-access', {
      method: 'POST',
      headers: {
        Origin: 'https://pr-848.preview.yawp.school',
        host: 'pr-848.preview.yawp.school',
      },
      body,
    })
  );

  expect(new URL(request.url).protocol).toBe('https:');

  let response: Response | undefined;
  try {
    await action({
      request,
      params: {},
      context: {} as never,
      url: new URL(request.url),
      pattern: '/auth/preview-access',
    });
  } catch (error) {
    response = error as Response;
  }

  expect(response?.status).toBe(302);
  expect(logout).toHaveBeenCalledTimes(1);
});

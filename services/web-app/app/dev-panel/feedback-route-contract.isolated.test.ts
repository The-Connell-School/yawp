import { beforeEach, describe, expect, mock, test } from 'bun:test';

const run = process.env.FEEDBACK_CONTRACT_ISOLATED === '1';

const productionBlocked = mock(async () =>
  Response.json({ error: 'Not found' }, { status: 404 })
);
const routeAllowed = mock(async () => null as Response | null);

mock.module('~/dev-panel/dev-panel-route-guard.server', () => ({
  assertDevPanelRoute: routeAllowed,
}));

mock.module('~/utils/auth.server', () => ({
  getUserId: mock(async () => null as string | null),
}));

const seat = {
  label: 'Preview seat',
  organizationId: 'org-preview-1',
};
const getPreviewAccessSeat = mock(async () => seat as typeof seat | null);
mock.module('~/utils/preview-access.server', () => ({
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired: () => true,
}));

mock.module('~/dev-panel/dev-panel-signed-out-feedback.server', () => ({
  ensureDevPanelSignedOutTesterUser: async () => 'signed-out-user-id',
  devPanelSeatRateLimitKey: () => 'dev_panel_feedback_seat:org-preview-1:Preview seat',
  DEV_PANEL_SIGNED_OUT_TESTER_EMAIL: 'dev-panel-signed-out-tester@example.test',
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        $executeRaw: async () => 0,
        testerFeedback: {
          count: async () => 0,
          create: async () => ({}),
        },
      }),
  },
}));

const { submitDevPanelFeedback, DEV_PANEL_FEEDBACK_BODY_LIMIT } = await import(
  '~/dev-panel/dev-panel-feedback.server'
);

function post(body: unknown, init: RequestInit = {}) {
  return new Request('http://localhost:5173/api/dev-panel/feedback', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:5173',
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
    ...init,
  });
}

const payload = {
  note: 'Test note',
  url: '/free',
  actions: [{ type: 'route', path: '/free' }],
};

describe.skipIf(!run)('submitDevPanelFeedback contract', () => {
  beforeEach(() => {
    routeAllowed.mockImplementation(async () => null);
    getPreviewAccessSeat.mockImplementation(async () => seat);
  });

  test('returns 404 when dev panel route guard blocks', async () => {
    routeAllowed.mockImplementationOnce(productionBlocked);
    const response = await submitDevPanelFeedback(post(payload));
    expect(response.status).toBe(404);
  });

  test('signed-out send without seat cookie returns 401', async () => {
    getPreviewAccessSeat.mockImplementationOnce(async () => null);
    const response = await submitDevPanelFeedback(post(payload));
    expect(response.status).toBe(401);
  });

  test('signed-out send with seat succeeds', async () => {
    const response = await submitDevPanelFeedback(post(payload));
    expect(response.status).toBe(201);
  });

  test('rejects bad origin, content type, and oversized body', async () => {
    expect(
      (await submitDevPanelFeedback(
        post(payload, {
          headers: {
            origin: 'https://evil.example',
            'content-type': 'application/json',
          },
        })
      )).status
    ).toBe(403);
    expect(
      (
        await submitDevPanelFeedback(
          new Request('http://localhost:5173/api/dev-panel/feedback', {
            method: 'POST',
            headers: { origin: 'http://localhost:5173', 'content-type': 'text/plain' },
            body: JSON.stringify(payload),
          })
        )
      ).status
    ).toBe(415);
    expect(
      (
        await submitDevPanelFeedback(
          new Request('http://localhost:5173/api/dev-panel/feedback', {
            method: 'POST',
            headers: {
              origin: 'http://localhost:5173',
              'content-type': 'application/json',
            },
            body: '{' + 'x'.repeat(DEV_PANEL_FEEDBACK_BODY_LIMIT) + '}',
          })
        )
      ).status
    ).toBe(413);
  });

  test('signed-in send succeeds', async () => {
    const auth = await import('~/utils/auth.server');
    (auth.getUserId as ReturnType<typeof mock>).mockImplementationOnce(
      async () => 'user-1'
    );
    const response = await submitDevPanelFeedback(post(payload));
    expect(response.status).toBe(201);
  });

  test('accepts realistic compressed screenshot payloads under body limit', async () => {
    const screenshot =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGCAjJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnL/2wBDAQ4ODhANDg4dERUQEBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Af//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAz8Cf//Z';
    const response = await submitDevPanelFeedback(
      post({ ...payload, screenshot })
    );
    expect(response.status).toBe(201);
  });
});

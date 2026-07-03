import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  getSessionExpirationDate: mock(() => new Date('2030-01-01T00:00:00.000Z')),
  sessionKey: 'sessionId',
}));

const { loader } = await import('./route');

const mockRequest = new Request('http://localhost/app/admin/assignments-grading');

describe('AssignmentsGrading loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('requires admin access', async () => {
    await loader({ request: mockRequest, params: {}, context: {} } as any);

    expect(requireAdmin).toHaveBeenCalledWith(mockRequest);
  });

  test('redirects to the consolidated assignment types page', async () => {
    const response = await loader({
      request: mockRequest,
      params: {},
      context: {},
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app/admin/assignments');
  });
});

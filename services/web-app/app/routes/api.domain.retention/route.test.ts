import { describe, expect, test } from 'bun:test';

const { loader } = await import('./route');

describe('api.domain.retention', () => {
  test('returns 401 when internal token is missing', async () => {
    process.env.INTERNAL_COMMAND_TOKEN = 'retention-token';

    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
    });

    const response = (await loader({ request } as any)) as Response;

    expect(response.status).toBe(401);
  });

  test('returns success with no-op message when token is valid', async () => {
    process.env.INTERNAL_COMMAND_TOKEN = 'retention-token';

    const request = new Request('https://example.com/api/domain/retention', {
      method: 'POST',
      headers: {
        'x-internal-token': 'retention-token',
      },
    });

    const response = (await loader({ request } as any)) as {
      data: { message: string };
    };

    expect(response.data).toMatchObject({
      message: 'No retention actions needed',
    });
  });
});

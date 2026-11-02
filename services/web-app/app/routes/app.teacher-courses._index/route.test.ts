import { describe, expect, test } from 'bun:test';

import { loader } from './route';

describe('legacy teacher courses route', () => {
  test('redirects to the teacher dashboard while the Lounge is disabled', async () => {
    const response = await loader();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app');
  });
});

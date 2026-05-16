import { describe, expect, test } from 'bun:test';

import { loader } from './route';

describe('legacy admin teacher courses route', () => {
  test('redirects to the admin teacher trainings page', async () => {
    const response = await loader();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/admin/teacher-trainings');
  });
});

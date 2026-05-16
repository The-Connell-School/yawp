import { describe, expect, test } from 'bun:test';

import { loader } from './route';

describe('legacy teacher courses route', () => {
  test('redirects to the teacher trainings lounge', async () => {
    const response = await loader();

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/teacher-trainings');
  });
});

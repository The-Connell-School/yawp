import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createOrganizationListHandler } from './internal-organizations.server';

const key = 'k'.repeat(43);
const URL_BASE = 'https://yawp.test/api/internal/v1/organizations';
const findMany = mock();
let credential: string | undefined = key;
const list = createOrganizationListHandler({ findMany }, () => credential);
const get = (headers: Record<string, string> = { authorization: `Bearer ${key}` }) =>
  new Request(URL_BASE, { headers });

describe('GET /api/internal/v1/organizations', () => {
  beforeEach(() => {
    credential = key;
    findMany.mockReset().mockResolvedValue([
      { id: 'org-b', name: 'Alpha Academy' },
      { id: 'org-a', name: 'Beta School' },
    ]);
  });

  test('is hidden when no management key is configured', async () => {
    credential = undefined;
    expect((await list(get())).status).toBe(404);
    expect(findMany).not.toHaveBeenCalled();
  });

  test('rejects a missing, short or wrong bearer before touching the database', async () => {
    for (const header of [undefined, 'Bearer', `Bearer ${key}x`, `bearer ${key}`, key]) {
      const headers: Record<string, string> = header === undefined ? {} : { authorization: header };
      expect((await list(get(headers))).status).toBe(401);
    }
    expect(findMany).not.toHaveBeenCalled();
  });

  test('refuses a malformed configured key', async () => {
    credential = 'short';
    expect((await list(get())).status).toBe(503);
  });

  test('only answers GET', async () => {
    const response = await list(
      new Request(URL_BASE, { method: 'POST', headers: { authorization: `Bearer ${key}` } })
    );
    expect(response.status).toBe(405);
  });

  test('lists every organization by name, without caching', async () => {
    const response = await list(get());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      organizations: [
        { id: 'org-b', name: 'Alpha Academy' },
        { id: 'org-a', name: 'Beta School' },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  });

  test('reports the directory as unavailable when the read fails', async () => {
    findMany.mockRejectedValue(new Error('db down'));
    expect((await list(get())).status).toBe(503);
  });
});

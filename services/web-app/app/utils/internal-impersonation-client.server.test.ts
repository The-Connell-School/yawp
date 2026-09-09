import { describe, expect, mock, test } from 'bun:test';
import { InternalImpersonationClient } from './internal-impersonation-client.server';

const key = 'b'.repeat(43);
const identity = { id: '4c42837b-a7a9-4c7b-adc7-d0bf4ad32067', actorId: 'member-1', userId: 'user-1', organizationId: 'org-1', expiresAt: new Date(Date.now() + 60000).toISOString() };
describe('Internal impersonation service client', () => {
  test('accepts only a plain HTTPS service origin and a strong backend key', () => {
    for (const origin of ['http://internal.test', 'https://user:pass@internal.test', 'https://internal.test/path', 'https://internal.test?x=y', 'https://internal.test#x']) {
      expect(() => new InternalImpersonationClient(origin, key)).toThrow();
    }
    expect(() => new InternalImpersonationClient('https://internal.test', 'short')).toThrow();
  });
  test('posts only the token on redemption with redirects disabled and a deadline', async () => {
    const transport = mock(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(identity));
    const client = new InternalImpersonationClient('https://internal.test', key, transport as typeof fetch);
    expect(await client.redeem('a'.repeat(43))).toEqual(identity);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe('https://internal.test/api/integrations/yawp/impersonations/redeem');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: JSON.stringify({ token: 'a'.repeat(43) }) });
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${key}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  test('rejects malformed, expired, excessive-lifetime and substituted contexts', async () => {
    for (const value of [
      { ...identity, actorId: '' }, { ...identity, expiresAt: 'bad' },
      { ...identity, expiresAt: new Date(Date.now() - 1000).toISOString() },
      { ...identity, expiresAt: new Date(Date.now() + 7200000).toISOString() },
      { ...identity, id: 'a1fe2f5d-7bb2-43c2-a4e3-f2d2f43025f1' },
    ]) {
      const client = new InternalImpersonationClient('https://internal.test', key, (async () => Response.json(value)) as typeof fetch);
      await expect(client.context(identity.id)).rejects.toThrow();
    }
  });
  test('never retries an uncertain single-use redemption or exposes upstream details', async () => {
    const transport = mock(async () => { throw new Error(`network ${key}`); });
    const client = new InternalImpersonationClient('https://internal.test', key, transport as typeof fetch);
    await expect(client.redeem('a'.repeat(43))).rejects.toThrow('Internal impersonation unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
    const denied = new InternalImpersonationClient('https://internal.test', key, (async () => new Response(key, { status: 403 })) as typeof fetch);
    await expect(denied.context(identity.id)).rejects.toThrow('Impersonation is inactive');
  });
  test('end sends only the authoritative session ID', async () => {
    const transport = mock(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 204 }));
    const client = new InternalImpersonationClient('https://internal.test', key, transport as typeof fetch);
    await client.end(identity.id);
    expect(transport.mock.calls[0]![1]?.body).toBe(JSON.stringify({ sessionId: identity.id }));
  });
});

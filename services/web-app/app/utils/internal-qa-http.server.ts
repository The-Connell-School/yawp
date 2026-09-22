import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { qaAccountsInput, type InternalQaAccounts } from './internal-qa.server';
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const digest = (value: string) => createHash('sha256').update(value).digest();

export function createQaHttp(service: Pick<InternalQaAccounts, 'create' | 'archive' | 'list'>, credential: () => string | undefined, enabled: () => boolean) {
  function auth(request: Request, method: string) {
    const key = credential();
    if (!enabled() || !key) return reply({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return reply({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return reply({ error: 'Unauthorized' }, 401);
    if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
    return null;
  }
  async function body(request: Request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
    const text = await request.text();
    if (text.length > 10000) throw new Error();
    return JSON.parse(text);
  }
  async function invoke(work: () => Promise<unknown>) {
    try { return reply(await work()); }
    catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.startsWith('Idempotency')) return reply({ error: 'Request ID already used with different inputs' }, 409);
      if (message.includes('seat limit')) return reply({ error: 'Organization seat limit exceeded' }, 409);
      if (message.includes('not found')) return reply({ error: 'Resource not found in organization' }, 404);
      return reply({ error: 'QA management unavailable' }, 503);
    }
  }
  return {
    async create(request: Request) {
      const denied = auth(request, 'POST'); if (denied) return denied;
      let input: z.infer<typeof qaAccountsInput>;
      try { input = qaAccountsInput.parse(await body(request)); } catch { return reply({ error: 'Invalid QA request' }, 400); }
      return invoke(() => service.create(input));
    },
    async archive(request: Request, id: string | undefined) {
      const denied = auth(request, 'POST'); if (denied) return denied;
      let input: { actorId: string; organizationId: string };
      try { z.string().uuid().parse(id); input = z.object({ actorId: identifier, organizationId: identifier, confirmArchive: z.literal(true) }).strict().parse(await body(request)); }
      catch { return reply({ error: 'Invalid archive request' }, 400); }
      return invoke(() => service.archive({ id: id!, actorId: input.actorId, organizationId: input.organizationId }));
    },
    async list(request: Request) {
      const denied = auth(request, 'GET'); if (denied) return denied;
      let input: { organizationId: string; cursor?: string };
      try {
        const params = new URL(request.url).searchParams;
        for (const key of params.keys()) if (params.getAll(key).length !== 1) throw new Error();
        input = z.object({ organizationId: identifier, cursor: z.string().uuid().optional() }).strict().parse(Object.fromEntries(params));
      } catch { return reply({ error: 'Select an organization' }, 400); }
      return invoke(() => service.list(input));
    },
  };
}

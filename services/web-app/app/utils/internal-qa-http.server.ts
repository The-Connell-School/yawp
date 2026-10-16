import { z } from 'zod';
import { qaAccountsInput, type InternalQaAccounts } from './internal-qa.server';
import {
  authenticate,
  authenticateAndAuditWrite,
} from '~/utils/internal-free-tier-http.server';
import {
  INTERNAL_API_HEADER_SIGNATURE,
  internalApiKeysConfigured,
} from '~/utils/internal-platform-auth.server';
import { readBoundedText } from '~/utils/bounded-body.server';
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export function createQaHttp(service: Pick<InternalQaAccounts, 'create' | 'archive' | 'list'>, _credential: () => string | undefined, enabled: () => boolean) {
  async function auth(request: Request, method: string, body?: string) {
    if (!enabled() || !internalApiKeysConfigured()) return reply({ error: 'Not found' }, 404);
    const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
    const denied = signed
      ? await authenticateAndAuditWrite(request, { body: body ?? '' })
      : await authenticate(request);
    if (denied) return denied;
    if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
    return null;
  }
  async function readRawBody(request: Request) {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
    const text = await readBoundedText(request, 10000);
    if (text === null) throw new Error();
    return text;
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
      let input: z.infer<typeof qaAccountsInput>;
      let bodyText = '';
      try {
        const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
        if (!signed) {
          const denied = await auth(request, 'POST');
          if (denied) return denied;
        }
        bodyText = await readRawBody(request);
        if (signed) {
          const denied = await auth(request, 'POST', bodyText);
          if (denied) return denied;
        }
        const parsed = JSON.parse(bodyText);
        input = qaAccountsInput.parse(parsed);
      } catch { return reply({ error: 'Invalid QA request' }, 400); }
      return invoke(() => service.create(input));
    },
    async archive(request: Request, id: string | undefined) {
      let input: { actorId: string; organizationId: string };
      let bodyText = '';
      try {
        const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
        if (!signed) {
          const denied = await auth(request, 'POST');
          if (denied) return denied;
        }
        bodyText = await readRawBody(request);
        if (signed) {
          const denied = await auth(request, 'POST', bodyText);
          if (denied) return denied;
        }
        const parsed = JSON.parse(bodyText);
        z.string().uuid().parse(id);
        input = z.object({ actorId: identifier, organizationId: identifier, confirmArchive: z.literal(true) }).strict().parse(parsed);
      }
      catch { return reply({ error: 'Invalid archive request' }, 400); }
      return invoke(() => service.archive({ id: id!, actorId: input.actorId, organizationId: input.organizationId }));
    },
    async list(request: Request) {
      const denied = await auth(request, 'GET');
      if (denied) return denied;
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

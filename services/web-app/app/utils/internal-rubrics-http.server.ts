import { z } from 'zod';
import { rubricPublicationInput, type InternalRubrics } from './internal-rubrics.server';
import { validateRubricPromotion } from '~/domain/rubrics/rubric-promotion';
import { authenticate } from '~/utils/internal-free-tier-http.server';
import { internalApiKeysConfigured } from '~/utils/internal-platform-auth.server';
import { readBoundedBody } from '~/utils/internal-admin-write.server';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const nameInput = z.string().regex(/^[A-Za-z0-9]+(?:(?:-|_)[A-Za-z0-9]+)*$/).max(120);
const limit = 300 * 1024;
async function readBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error();
  if (new URL(request.url).search) throw new Error();
  const length = request.headers.get('content-length');
  if (length !== null && !/^\d+$/.test(length)) throw new Error();
  return readBoundedBody(request, limit);
}
export function createRubricHttp(service: Pick<InternalRubrics, 'inspect' | 'publish'>, _credential: () => string | undefined, enabled: () => boolean) {
  async function auth(request: Request, method: string, body?: Uint8Array | string) {
    if (!enabled() || !internalApiKeysConfigured()) return reply({ error: 'Not found' }, 404);
    const denied = await authenticate(request, { body });
    if (denied) return denied;
    if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
    return null;
  }
  async function invoke(work: () => Promise<unknown>) {
    try { return reply(await work()); }
    catch (error) {
      const code = (error as { statusCode?: number })?.statusCode;
      if (code === 409) return reply({ error: 'Rubric changed or request ID already used with different inputs' }, 409);
      if (code === 403) return reply({ error: 'Protected starter rubric requires a new portable name' }, 403);
      if (code === 400) return reply({ error: 'Invalid rubric publication' }, 400);
      return reply({ error: 'Rubric management unavailable' }, 503);
    }
  }
  return {
    async inspect(request: Request) {
      const denied = await auth(request, 'GET'); if (denied) return denied;
      let name: string;
      try {
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some(key => key !== 'name' || params.getAll(key).length !== 1)) throw new Error();
        name = nameInput.parse(params.get('name'));
      } catch { return reply({ error: 'Provide one rubric name' }, 400); }
      return invoke(async () => ({ rubric: await service.inspect(name) }));
    },
    async validate(request: Request) {
      let schema: unknown;
      try {
        const body = await readBody(request);
        const denied = await auth(request, 'POST', body);
        if (denied) return denied;
        // Preserve a leading BOM so JSON.parse rejects it; never decode lossily.
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body));
        schema = z.object({ schema: z.unknown() }).strict().parse(parsed).schema;
      }
      catch (error) {
        if (error instanceof Response) return error;
        return reply({ error: 'Invalid validation request' }, 400);
      }
      return reply(validateRubricPromotion(schema));
    },
    async publish(request: Request) {
      let input: z.infer<typeof rubricPublicationInput>;
      try {
        const body = await readBody(request);
        const denied = await auth(request, 'POST', body);
        if (denied) return denied;
        const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body));
        input = rubricPublicationInput.parse(parsed);
      }
      catch (error) {
        if (error instanceof Response) return error;
        return reply({ error: 'Invalid rubric publication' }, 400);
      }
      const validation = validateRubricPromotion(input.schema);
      if (!validation.ok) return reply(validation, 422);
      return invoke(() => service.publish(input));
    },
  };
}

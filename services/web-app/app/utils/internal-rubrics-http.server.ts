import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { rubricPublicationInput, type InternalRubrics } from './internal-rubrics.server';
import { validateRubricPromotion } from '~/domain/rubrics/rubric-promotion';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const digest = (value: string) => createHash('sha256').update(value).digest();
const nameInput = z.string().regex(/^[A-Za-z0-9]+(?:(?:-|_)[A-Za-z0-9]+)*$/).max(120);
const limit = 300 * 1024;
async function readBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error();
  if (new URL(request.url).search) throw new Error();
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error();
  const reader = request.body?.getReader(); if (!reader) throw new Error();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createRubricHttp(service: Pick<InternalRubrics, 'inspect' | 'publish'>, credential: () => string | undefined, enabled: () => boolean) {
  function auth(request: Request, method: string) {
    const key = credential();
    if (!enabled() || !key) return reply({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return reply({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return reply({ error: 'Unauthorized' }, 401);
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
      const denied = auth(request, 'GET'); if (denied) return denied;
      let name: string;
      try {
        const params = new URL(request.url).searchParams;
        if ([...params.keys()].some(key => key !== 'name' || params.getAll(key).length !== 1)) throw new Error();
        name = nameInput.parse(params.get('name'));
      } catch { return reply({ error: 'Provide one rubric name' }, 400); }
      return invoke(async () => ({ rubric: await service.inspect(name) }));
    },
    async validate(request: Request) {
      const denied = auth(request, 'POST'); if (denied) return denied;
      let schema: unknown;
      try { schema = z.object({ schema: z.unknown() }).strict().parse(await readBody(request)).schema; }
      catch { return reply({ error: 'Invalid validation request' }, 400); }
      return reply(validateRubricPromotion(schema));
    },
    async publish(request: Request) {
      const denied = auth(request, 'POST'); if (denied) return denied;
      let input: z.infer<typeof rubricPublicationInput>;
      try { input = rubricPublicationInput.parse(await readBody(request)); }
      catch { return reply({ error: 'Invalid rubric publication' }, 400); }
      const validation = validateRubricPromotion(input.schema);
      if (!validation.ok) return reply(validation, 422);
      return invoke(() => service.publish(input));
    },
  };
}

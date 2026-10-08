import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CatalogError, type RubricCatalog } from '~/domain/rubrics/rubric-catalog.server';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const digest = (value: string) => createHash('sha256').update(value).digest();
const LIMIT = 300 * 1024;

export const saveInput = z.object({
  key: z.string().min(1).max(160),
  requestId: z.string().uuid(),
  actorEmail: z.string().trim().toLowerCase().email().max(254),
  reason: z.string().trim().min(3).max(500),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  document: z.record(z.unknown()),
}).strict();

export const stageInput = z.object({
  key: saveInput.shape.key,
  requestId: saveInput.shape.requestId,
  actorEmail: saveInput.shape.actorEmail,
  reason: saveInput.shape.reason,
  document: saveInput.shape.document,
  source: z.object({
    contentId: z.string().uuid(),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();

async function readJson(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error('content-type');
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > LIMIT)) throw new Error('too large');
  const reader = request.body?.getReader(); if (!reader) throw new Error('empty');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new Error('too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Rubric manager endpoints for the internal app, authenticated with the same
 * management service key as the other /api/internal/v1 management routes.
 */
export function createRubricCatalogHttp(service: Pick<RubricCatalog, 'list' | 'get' | 'save' | 'stage'>, credential: () => string | undefined) {
  function auth(request: Request, method: 'GET' | 'POST') {
    const key = credential();
    if (!key) return reply({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return reply({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') ?? '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`))) return reply({ error: 'Unauthorized' }, 401);
    if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
    return null;
  }
  function failure(error: unknown) {
    if (error instanceof CatalogError) {
      if (error.statusCode === 500) return reply({ error: 'Rubric catalog unavailable' }, 503);
      return reply({ error: error.message, ...(error.issues ? { issues: error.issues } : {}) }, error.statusCode);
    }
    return reply({ error: 'Rubric catalog unavailable' }, 503);
  }
  async function write<T extends z.ZodTypeAny>(request: Request, schema: T, label: string, handler: (input: z.infer<T>) => Promise<unknown>) {
    const denied = auth(request, 'POST'); if (denied) return denied;
    if (new URL(request.url).search) return reply({ error: 'Invalid query' }, 400);
    let input: z.infer<T>;
    try { input = schema.parse(await readJson(request)); }
    catch { return reply({ error: `Invalid ${label} request` }, 400); }
    try { return reply(await handler(input)); } catch (error) { return failure(error); }
  }
  return {
    async list(request: Request) {
      const denied = auth(request, 'GET'); if (denied) return denied;
      if (new URL(request.url).search) return reply({ error: 'Invalid query' }, 400);
      try { return reply(await service.list()); } catch (error) { return failure(error); }
    },
    async get(request: Request) {
      const denied = auth(request, 'GET'); if (denied) return denied;
      const params = new URL(request.url).searchParams;
      const keys = [...params.keys()];
      if (keys.length !== 1 || keys[0] !== 'key' || params.getAll('key').length !== 1) return reply({ error: 'Provide one rubric key' }, 400);
      try { return reply(await service.get(params.get('key')!)); } catch (error) { return failure(error); }
    },
    save: (request: Request) => write(request, saveInput, 'save', (input) => service.save(input)),
    /** Appends an Internal-authored revision without publishing it (demo-org staging). */
    stage: (request: Request) => write(request, stageInput, 'stage', (input) => service.stage(input)),
  };
}
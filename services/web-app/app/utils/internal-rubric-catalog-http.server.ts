import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CatalogError, type RubricCatalog } from '~/domain/rubrics/rubric-catalog.server';
import {
  authorizeInternalApiRequest,
  internalApiKeysConfigured,
  recordInternalPlatformWriteAudit,
  type InternalApiAuthContext,
} from '~/utils/internal-platform-auth.server';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
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
  expectedFingerprint: saveInput.shape.expectedFingerprint.optional(),
  document: saveInput.shape.document,
  source: z.object({
    contentId: z.string().uuid(),
    version: z.number().int().positive(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
}).strict();

export const clearReleaseInput = z.object({
  key: saveInput.shape.key,
  actorEmail: saveInput.shape.actorEmail,
  reason: saveInput.shape.reason,
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
export function createRubricCatalogHttp(service: Pick<RubricCatalog, 'list' | 'get' | 'save' | 'stage' | 'clearRelease'>, _credential: () => string | undefined) {
  async function auth(
    request: Request,
    method: 'GET' | 'POST',
    body?: Uint8Array | string
  ): Promise<Response | InternalApiAuthContext> {
    if (!internalApiKeysConfigured()) return reply({ error: 'Not found' }, 404);
    const result = await authorizeInternalApiRequest(request, { body });
    if (result instanceof Response) return result;
    if (request.method !== method) return reply({ error: 'Method not allowed' }, 405);
    return result;
  }
  function failure(error: unknown) {
    if (error instanceof CatalogError) {
      if (error.statusCode === 500) return reply({ error: 'Rubric catalog unavailable' }, 503);
      return reply({ error: error.message, ...(error.issues ? { issues: error.issues } : {}) }, error.statusCode);
    }
    return reply({ error: 'Rubric catalog unavailable' }, 503);
  }
  async function write<T extends z.ZodTypeAny>(request: Request, schema: T, label: string, handler: (input: z.infer<T>) => Promise<unknown>) {
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (new URL(request.url).search) return reply({ error: 'Invalid query' }, 400);
    let raw: unknown;
    let bodyText = '';
    try {
      raw = await readJson(request);
      bodyText = JSON.stringify(raw);
    } catch {
      return reply({ error: `Invalid ${label} request` }, 400);
    }
    const authResult = await auth(request, 'POST', bodyText);
    if (authResult instanceof Response) return authResult;
    let input: z.infer<T>;
    try { input = schema.parse(raw); }
    catch { return reply({ error: `Invalid ${label} request` }, 400); }
    try {
      const result = await handler(input);
      if (authResult.mode === 'hmac') {
        await recordInternalPlatformWriteAudit({
          actorEmail: authResult.actorEmail,
          keyId: authResult.keyId,
          endpoint: `POST ${new URL(request.url).pathname}`,
          requestHash: createHash('sha256').update(bodyText).digest('hex'),
          result: 'success',
        });
      }
      return reply(result);
    } catch (error) { return failure(error); }
  }
  return {
    async list(request: Request) {
      const denied = await auth(request, 'GET'); if (denied instanceof Response) return denied;
      if (new URL(request.url).search) return reply({ error: 'Invalid query' }, 400);
      try { return reply(await service.list()); } catch (error) { return failure(error); }
    },
    async get(request: Request) {
      const denied = await auth(request, 'GET'); if (denied instanceof Response) return denied;
      const params = new URL(request.url).searchParams;
      const keys = [...params.keys()];
      if (keys.length !== 1 || keys[0] !== 'key' || params.getAll('key').length !== 1) return reply({ error: 'Provide one rubric key' }, 400);
      try { return reply(await service.get(params.get('key')!)); } catch (error) { return failure(error); }
    },
    save: (request: Request) => write(request, saveInput, 'save', (input) => service.save(input)),
    /**
     * Appends an Internal-authored revision without moving live content and
     * releases it for the key (schools with `internal_rubrics` on use it).
     */
    stage: (request: Request) => write(request, stageInput, 'stage', (input) => service.stage(input)),
    /** Withdraws a key's release; the revision and existing pins are kept. */
    clearRelease: (request: Request) => write(request, clearReleaseInput, 'unrelease', (input) => service.clearRelease(input)),
  };
}
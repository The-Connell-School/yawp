import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  InternalAssignmentTypes,
  assignmentTypePerTypeUpdateInput,
  assignmentTypeRelinkInput,
  assignmentTypeCompareInput,
} from './internal-assignment-types.server';

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const digest = (value: string) => createHash('sha256').update(value).digest();

const limit = 300 * 1024;
async function readBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') throw new Error();
  if (new URL(request.url).search) throw new Error();
  const length = request.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) throw new Error();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createAssignmentTypesHttp(
  service: Pick<InternalAssignmentTypes, 'list' | 'read' | 'updatePerType' | 'relinkLibrary' | 'compareRevisions'>,
  credential: () => string | undefined,
  enabled: () => boolean
) {
  function auth(request: Request, methods: string[]) {
    const key = credential();
    if (!enabled() || !key) return reply({ error: 'Not found' }, 404);
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) return reply({ error: 'Integration unavailable' }, 503);
    const supplied = request.headers.get('authorization') || '';
    if (supplied.length > 512 || !timingSafeEqual(digest(supplied), digest(`Bearer ${key}`)))
      return reply({ error: 'Unauthorized' }, 401);
    if (!methods.includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
    return null;
  }
  async function invoke(work: () => Promise<unknown>) {
    try {
      return reply(await work());
    } catch (error) {
      const code = (error as { statusCode?: number })?.statusCode;
      if (code === 409) return reply({ error: 'Assignment type changed or request ID already used with different inputs' }, 409);
      if (code === 404) return reply({ error: 'Not found' }, 404);
      if (code === 400) return reply({ error: 'Invalid assignment type request' }, 400);
      return reply({ error: 'Assignment type management unavailable' }, 503);
    }
  }
  function parseIdFromPath(url: URL): string | null {
    const parts = url.pathname.split('/').filter(Boolean);
    // /api/internal/v1/assignment-types/:id(/...)
    const idx = parts.findIndex((p) => p === 'assignment-types');
    if (idx >= 0 && parts.length > idx + 1) return parts[idx + 1]!;
    return null;
  }
  return {
    async list(request: Request) {
      const denied = auth(request, ['GET']); if (denied) return denied;
      // No query parameters yet; return all active types
      return invoke(() => service.list());
    },
    async read(request: Request) {
      const denied = auth(request, ['GET']); if (denied) return denied;
      const id = parseIdFromPath(new URL(request.url));
      if (!id) return reply({ error: 'Provide an assignment type id' }, 400);
      return invoke(async () => {
        const data = await service.read(id);
        return { assignmentType: data };
      });
    },
    async updatePerType(request: Request) {
      const denied = auth(request, ['POST']); if (denied) return denied;
      const id = parseIdFromPath(new URL(request.url));
      if (!id) return reply({ error: 'Provide an assignment type id' }, 400);
      let input: z.infer<typeof assignmentTypePerTypeUpdateInput>;
      try {
        input = assignmentTypePerTypeUpdateInput.parse(await readBody(request));
      } catch {
        return reply({ error: 'Invalid assignment type update' }, 400);
      }
      return invoke(async () => {
        const result = await service.updatePerType(id, input);
        return { revision: result.revision, unchanged: result.unchanged };
      });
    },
    async relink(request: Request) {
      const denied = auth(request, ['POST']); if (denied) return denied;
      const id = parseIdFromPath(new URL(request.url));
      if (!id) return reply({ error: 'Provide an assignment type id' }, 400);
      let input: z.infer<typeof assignmentTypeRelinkInput>;
      try {
        input = assignmentTypeRelinkInput.parse(await readBody(request));
      } catch {
        return reply({ error: 'Invalid assignment type relink' }, 400);
      }
      return invoke(async () => {
        const result = await service.relinkLibrary(id, input);
        return { revision: result.revision, unchanged: result.unchanged };
      });
    },
    async compare(request: Request) {
      const denied = auth(request, ['POST']); if (denied) return denied;
      let input: z.infer<typeof assignmentTypeCompareInput>;
      try {
        input = assignmentTypeCompareInput.parse(await readBody(request));
      } catch {
        return reply({ error: 'Invalid compare request' }, 400);
      }
      return invoke(() => service.compareRevisions(input.a, input.b));
    },
  };
}


import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled, isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';
import { FREE_TIER_LIMIT_BOUNDS, type FreeTierLimits } from '~/domain/free-tier/limits';
import { readFreeTierLimits, updateFreeTierLimits } from '~/domain/free-tier/limits.server';
import { readBoundedText } from './bounded-body.server';
import { authorizeInternalApiRequest, INTERNAL_API_HEADER_SIGNATURE, recordInternalPlatformWriteAudit } from './internal-platform-auth.server';

const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});
const inputSchema = z.object({
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  studentSeatCap: z.unknown().optional(),
  lessonPlannerMonthly: z.unknown().optional(),
  reporterMonthly: z.unknown().optional(),
}).strict().refine(input => Object.keys(FREE_TIER_LIMIT_BOUNDS).some(key => key in input));

export async function freeTierLimitsHttp(request: Request): Promise<Response> {
  if (!(await isFreeTierEnabled())) return response({ error: 'Not found' }, 404);
  if (!['GET', 'PUT'].includes(request.method)) return response({ error: 'Method not allowed' }, 405);
  if (new URL(request.url).search) return response({ error: 'Invalid query' }, 400);
  if (!request.headers.get(INTERNAL_API_HEADER_SIGNATURE)) return response({ error: 'Unauthorized' }, 401);
  let body = '';
  if (request.method === 'PUT') {
    if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'Invalid content type' }, 400);
    const text = await readBoundedText(request, 32768);
    if (text === null) return response({ error: 'Payload too large' }, 413);
    body = text;
  }
  const auth = await authorizeInternalApiRequest(request, { body,
    requiredScope: request.method === 'PUT' ? 'management:write' : 'management:read',
  });
  if (auth instanceof Response) return auth;
  if (request.method === 'GET') return response(await readFreeTierLimits());
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG))) return response({ error: 'flag_off' }, 409);
  let input: z.infer<typeof inputSchema>;
  try { input = inputSchema.parse(JSON.parse(body)); }
  catch { return response({ error: 'Invalid input' }, 400); }
  for (const field of Object.keys(FREE_TIER_LIMIT_BOUNDS) as (keyof FreeTierLimits)[]) {
    if (!(field in input)) continue;
    const value = input[field];
    const [min, max] = FREE_TIER_LIMIT_BOUNDS[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
      return response({ error: 'out_of_bounds', field }, 422);
  }
  const result = await updateFreeTierLimits(input as Partial<FreeTierLimits> & { version: number }, auth.actorEmail);
  if (!result) return response({ error: 'version_conflict' }, 409);
  await recordInternalPlatformWriteAudit({ actorEmail: auth.actorEmail, keyId: auth.keyId,
    endpoint: 'PUT /api/internal/v1/free-tier/limits',
    requestHash: createHash('sha256').update(body).digest('hex'), result: 'success',
  });
  return response(result);
}

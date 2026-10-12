import { z } from 'zod';
import {
  authorizeInternalApiRequest,
  internalApiKeysConfigured,
} from '~/utils/internal-platform-auth.server';
import {
  listPlatformApiAudit,
  parsePlatformApiAuditRange,
  platformApiAuditQuerySchema,
} from '~/utils/internal-platform-api-audit-list.server';

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

export async function loader({ request }: { request: Request }) {
  if (!internalApiKeysConfigured()) return response({ error: 'Not found' }, 404);
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, {
    requiredScope: 'audit:read',
  });
  if (auth instanceof Response) return auth;

  let range: { since: Date; until: Date };
  let queryDays: { since: string; until: string };
  let limit = 50;
  let cursor: string | undefined;
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = platformApiAuditQuerySchema.parse(params);
    queryDays = { since: parsed.since, until: parsed.until };
    range = parsePlatformApiAuditRange(parsed);
    limit = parsed.limit;
    cursor = parsed.cursor;
  } catch {
    return response({ error: 'Invalid query' }, 400);
  }

  try {
    const page = await listPlatformApiAudit({
      since: range.since,
      until: range.until,
      limit,
      cursor,
    });
    return response({
      since: queryDays.since,
      until: queryDays.until,
      ...page,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return response({ error: 'Invalid query' }, 400);
    }
    console.error('internal_platform_api_audit_list_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ error: 'Platform API audit unavailable' }, 503);
  }
}

import {
  authorizeInternalApiRequest,
  internalApiKeysConfigured,
} from '~/utils/internal-platform-auth.server';
import {
  gradingStatsQuerySchema,
  loadGradingStats,
  parseGradingStatsRange,
} from '~/utils/internal-grading-stats.server';

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

export async function loader({ request }: { request: Request }) {
  if (!internalApiKeysConfigured()) return response({ error: 'Not found' }, 404);
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  const auth = await authorizeInternalApiRequest(request, {
    requiredScope: 'stats:read',
  });
  if (auth instanceof Response) return auth;

  let range: { since: Date; until: Date };
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = gradingStatsQuerySchema.parse(params);
    range = parseGradingStatsRange(parsed);
  } catch {
    return response({ error: 'Invalid query' }, 400);
  }

  try {
    const rows = await loadGradingStats(range);
    return response({
      since: range.since.toISOString(),
      until: range.until.toISOString(),
      rows,
    });
  } catch (error) {
    console.error('internal_grading_stats_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ error: 'Grading stats unavailable' }, 503);
  }
}

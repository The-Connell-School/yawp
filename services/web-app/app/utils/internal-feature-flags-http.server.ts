import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import { authenticate } from '~/utils/internal-free-tier-http.server';
import {
  FEATURE_FLAG_MODES,
  MAX_FEATURE_FLAG_ORG_IDS,
  type FeatureFlagValue,
  isFeatureFlagKey,
  normalizeFeatureFlagValue,
} from '~/domain/feature-flags/feature-flags';
import {
  findUnknownOrganizationIds,
  listFeatureFlags,
  setFeatureFlag,
} from '~/domain/feature-flags/feature-flags.server';

/**
 * Read and set the feature flags from the internal app: off, on for
 * everyone, or on for a list of schools. Same management-key bearer auth as
 * the free-tier endpoints; every change must name the operator making it.
 */

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const operatorEmail = z.string().trim().toLowerCase().email().max(320);
const organizationId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
/** Legacy body: on for everyone, or off. */
const legacyBody = z.object({ enabled: z.boolean() }).strict();
/** Schools are required for targeted and ignored (cleared) otherwise. */
const modeBody = z
  .object({
    mode: z.enum(FEATURE_FLAG_MODES),
    orgIds: z.array(organizationId).max(MAX_FEATURE_FLAG_ORG_IDS).optional(),
  })
  .strict();
const updateBody = z.union([legacyBody, modeBody]);
// 2000 ids of up to 128 characters, with JSON punctuation.
const MAX_BODY_BYTES = 300_000;

function requestedValue(body: z.infer<typeof updateBody>): FeatureFlagValue {
  if ('enabled' in body) {
    return { mode: body.enabled ? 'everyone' : 'off', orgIds: [] };
  }
  return normalizeFeatureFlagValue(body.mode, body.orgIds ?? []);
}

export async function featureFlagsList(request: Request) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'GET') return response({ error: 'Method not allowed' }, 405);
  try {
    return response({ flags: await listFeatureFlags() });
  } catch (error) {
    console.error('feature_flags_list_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ error: 'Could not read feature flags' }, 500);
  }
}

export async function featureFlagUpdate(request: Request, key: string | undefined) {
  const denied = authenticate(request);
  if (denied) return denied;
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  if (!isFeatureFlagKey(key)) return response({ error: 'Unknown feature flag' }, 404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ error: 'Invalid content type' }, 400);
  }
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return response({ error: 'Malformed JSON' }, 400);
  }
  const body = updateBody.safeParse(parsed);
  if (!body.success) return response({ error: 'Invalid input' }, 400);
  const next = requestedValue(body.data);
  if (next.mode === 'targeted' && next.orgIds.length === 0) {
    return response(
      { error: 'Targeted flags need at least one organization' },
      400
    );
  }
  const operator = operatorEmail.safeParse(
    request.headers.get('x-yawp-operator-email') ?? ''
  );
  if (!operator.success) return response({ error: 'Invalid operator email' }, 400);

  try {
    const unknownOrgIds = await findUnknownOrganizationIds(next.orgIds);
    if (unknownOrgIds.length > 0) {
      return response({ error: 'Unknown organizations', unknownOrgIds }, 400);
    }
    const result = await setFeatureFlag(key, next, operator.data);
    console.info('feature_flag_set', {
      key,
      mode: next.mode,
      orgCount: next.orgIds.length,
      changed: result.changed,
      operator: operator.data,
    });
    // previousEnabled is for readers that predate per-school targeting.
    return response({
      ...result,
      previousEnabled: result.previous.mode === 'everyone',
    });
  } catch (error) {
    console.error('feature_flag_set_failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ error: 'Could not update feature flag' }, 500);
  }
}

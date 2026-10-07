import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import { authenticate } from '~/utils/internal-free-tier-http.server';
import { isFeatureFlagKey } from '~/domain/feature-flags/feature-flags';
import {
  listFeatureFlags,
  setFeatureFlag,
} from '~/domain/feature-flags/feature-flags.server';

/**
 * Read and toggle the global feature flags from the internal app. Same
 * management-key bearer auth as the free-tier endpoints; every change must
 * name the operator making it.
 */

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const operatorEmail = z.string().trim().toLowerCase().email().max(320);
const updateBody = z.object({ enabled: z.boolean() }).strict();

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
  const text = await readBoundedText(request, 4096);
  if (text === null) return response({ error: 'Payload too large' }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return response({ error: 'Malformed JSON' }, 400);
  }
  const body = updateBody.safeParse(parsed);
  if (!body.success) return response({ error: 'Invalid input' }, 400);
  const operator = operatorEmail.safeParse(
    request.headers.get('x-yawp-operator-email') ?? ''
  );
  if (!operator.success) return response({ error: 'Invalid operator email' }, 400);

  try {
    const result = await setFeatureFlag(key, body.data.enabled, operator.data);
    console.info('feature_flag_set', {
      key,
      enabled: body.data.enabled,
      changed: result.changed,
      operator: operator.data,
    });
    return response(result);
  } catch (error) {
    console.error('feature_flag_set_failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return response({ error: 'Could not update feature flag' }, 500);
  }
}

import { z } from 'zod';
import { readBoundedText } from '~/utils/bounded-body.server';
import {
  authenticate,
  authenticateAndAuditWrite,
} from '~/utils/internal-free-tier-http.server';
import { INTERNAL_API_HEADER_SIGNATURE } from '~/utils/internal-platform-auth.server';
import { resolveFeatureFlagKey } from '~/domain/feature-flags/feature-flags';
import {
  OrganizationFeatureFlagConflictError,
  disableFeatureFlagForOrganization,
  enableFeatureFlagForOrganization,
  releaseFeatureFlagToEveryone,
} from '~/domain/feature-flags/feature-flags-org.server';
import { findUnknownOrganizationIds } from '~/domain/feature-flags/feature-flags.server';
import { buildSafeErrorForLog } from '~/utils/server-error-request-context.server';

/**
 * Per-organization feature-flag controls for Yawp Internal organization pages.
 */

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  });

const operatorEmail = z.string().trim().toLowerCase().email().max(320);
const organizationId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const updateBody = z
  .object({
    action: z.enum(['enable', 'disable', 'release_everyone']),
  })
  .strict();

const MAX_BODY_BYTES = 8_192;

export async function organizationFeatureFlagUpdate(
  request: Request,
  organizationIdParam: string | undefined,
  flagKeyParam: string | undefined
) {
  if (request.method !== 'POST') {
    return response({ error: 'Method not allowed' }, 405);
  }
  const signed = Boolean(request.headers.get(INTERNAL_API_HEADER_SIGNATURE));
  if (!signed) {
    const denied = await authenticate(request);
    if (denied) return denied;
  }
  const text = await readBoundedText(request, MAX_BODY_BYTES);
  if (signed) {
    const denied = await authenticateAndAuditWrite(request, { body: text ?? '' });
    if (denied) return denied;
  }
  const orgParsed = organizationId.safeParse(organizationIdParam);
  if (!orgParsed.success) {
    return response({ error: 'Invalid organization' }, 400);
  }
  const flagKey = resolveFeatureFlagKey(flagKeyParam);
  if (!flagKey) return response({ error: 'Unknown feature flag' }, 404);
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response({ error: 'Invalid content type' }, 400);
  }
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

  const orgId = orgParsed.data;
  try {
    const unknownOrgIds = await findUnknownOrganizationIds([orgId]);
    if (unknownOrgIds.length > 0) {
      return response({ error: 'Unknown organization', unknownOrgIds }, 400);
    }
    const audit = { source: 'internal_api' as const };
    const result =
      body.data.action === 'release_everyone'
        ? await releaseFeatureFlagToEveryone(flagKey, operator.data, audit)
        : body.data.action === 'enable'
          ? await enableFeatureFlagForOrganization(
              flagKey,
              orgId,
              operator.data,
              audit
            )
          : await disableFeatureFlagForOrganization(
              flagKey,
              orgId,
              operator.data,
              audit
            );
    console.info('organization_feature_flag_set', {
      organizationId: orgId,
      key: flagKey,
      action: body.data.action,
      changed: result.changed,
      operator: operator.data,
    });
    return response({
      organizationId: orgId,
      ...result,
      previousEnabled: result.previous.mode === 'everyone',
    });
  } catch (error) {
    if (error instanceof OrganizationFeatureFlagConflictError) {
      return response({ error: error.message }, 409);
    }
    console.error('organization_feature_flag_set_failed', {
      organizationId: orgId,
      key: flagKeyParam,
      error: buildSafeErrorForLog(error),
    });
    return response({ error: 'Could not update feature flag' }, 500);
  }
}

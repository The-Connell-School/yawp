import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { isBelowHsGrade, withBelowHsTag } from './grade-gate';
import { canRedeemToken, findAcquisitionTokenByCredential, waitlistInputSchema } from './service.server';

const schema = waitlistInputSchema.extend({
  gradeLevel: z.string().refine(isBelowHsGrade), token: z.string().trim().min(1).max(500).optional(),
});
export type BelowHsDeclineInput = z.input<typeof schema>;
const response = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
});

/**
 * Internal persistence boundary for fto-free-page, not a public HTTP endpoint.
 * Public callers retain their existing free-tier access gate, throttling and
 * body limits. Call before normal waitlist/token admission for an explicit
 * below-HS selection. Never use this to classify historical free-text grades.
 * Returns the same success for a new, repeated or already eligible email.
 */
export async function recordBelowHsDecline(input: BelowHsDeclineInput): Promise<Response> {
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG))) return response({ error: 'flag_off' }, 409);
  const parsed = schema.safeParse(input);
  if (!parsed.success) return response({ error: 'Invalid input' }, 400);
  const { token: credential, middleName, ...applicant } = parsed.data;
  if (middleName?.trim()) return response({ ok: true });
  const token = credential ? await findAcquisitionTokenByCredential(credential) : null;
  if (credential && (!token || !canRedeemToken(token).ok)) return response({ error: 'Invalid token' }, 400);
  await prisma.$transaction(async tx => {
    // Serialize with all token redemption and operator release. The unique
    // email and create-only insert also protect other concurrent submissions.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
    await tx.freeTierApplication.createMany({
      data: [{ ...applicant, status: 'REJECTED', tags: withBelowHsTag(), acquisitionTokenId: token?.id ?? null }],
      skipDuplicates: true,
    });
  });
  return response({ ok: true });
}

import type { Prisma } from '@app/prisma';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import {
  featureFlagSettingName,
} from '~/domain/feature-flags/feature-flags';
import { isFreeTierCapabilityEnabled } from '~/domain/feature-flags/feature-flags.server';
import { DEFAULT_FREE_TIER_LIMITS, FREE_TIER_LIMIT_BOUNDS, type FreeTierLimits } from './limits';

export const FREE_TIER_LIMITS_SETTING = 'free_tier.limits.v1';
const storedSchema = z.object({
  studentSeatCap: z.number().int().min(1).max(200),
  lessonPlannerMonthly: z.number().int().min(0).max(100),
  reporterMonthly: z.number().int().min(0).max(100),
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.string().datetime(),
  updatedByEmail: z.string().email(),
}).strict();
type Client = Pick<Prisma.TransactionClient, 'setting'>;
const defaultState = () => ({ ...DEFAULT_FREE_TIER_LIMITS,
  updatedAt: null, updatedByEmail: null, version: 0,
});
const stateFrom = (row: { value: string } | null) => row
  ? storedSchema.parse(JSON.parse(row.value)) : defaultState();

/** Deployment DB/schema owns the environment; clients cannot select one here. No process cache. */
export async function readFreeTierLimits(client: Client = prisma) {
  const row = await client.setting.findUnique({ where: { name: FREE_TIER_LIMITS_SETTING }, select: { value: true } });
  return { ...stateFrom(row), bounds: FREE_TIER_LIMIT_BOUNDS };
}

export type FreeTierLimitsUpdate = Partial<FreeTierLimits> & { version: number };

/** One SQL compare-and-set, including the race to initialize an absent setting. */
export async function updateFreeTierLimits(input: FreeTierLimitsUpdate, actorEmail: string, client: Client = prisma) {
  const row = await client.setting.findUnique({ where: { name: FREE_TIER_LIMITS_SETTING }, select: { value: true } });
  const current = stateFrom(row);
  if (current.version !== input.version) return null;
  const { version, ...changes } = input;
  const next = storedSchema.parse({ ...current, ...changes, version: version + 1,
    updatedAt: new Date().toISOString(), updatedByEmail: actorEmail,
  });
  const value = JSON.stringify(next);
  const result = row
    ? await client.setting.updateMany({ where: { name: FREE_TIER_LIMITS_SETTING, value: row.value },
        data: { value, updatedAt: new Date(next.updatedAt) } })
    : await client.setting.createMany({ data: { name: FREE_TIER_LIMITS_SETTING, value,
        valueType: 'json', updatedAt: new Date(next.updatedAt) }, skipDuplicates: true });
  return result.count === 1 ? { ...next, bounds: FREE_TIER_LIMIT_BOUNDS } : null;
}

/** Existing plans/flag-off callers retain their defaults. Targeting is per organization. */
export async function effectiveFreeTierLimits(organizationId: string, client: Client = prisma) {
  // A seat check already holds a transaction and class lock. Keep its reads on
  // that connection instead of waiting for another pool connection under load.
  const monthly = await isFreeTierCapabilityEnabled(organizationId, client);
  if (!monthly) return { limits: DEFAULT_FREE_TIER_LIMITS, monthly: false };
  return { limits: await readFreeTierLimits(client), monthly: true };
}

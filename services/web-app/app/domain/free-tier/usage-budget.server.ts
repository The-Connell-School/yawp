import type { FreeTierApplicationStatus, Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';

export const FREE_TIER_BUDGET_ACTIVE_STATUSES: FreeTierApplicationStatus[] = [
  'INVITED',
  'ACCOUNT_CREATED',
  'ADMIN_SUBMITTED',
  'SENT',
  'MANUAL_REVIEW',
  'APPROVED',
];

export class FreeTierBudgetExceededError extends Error {
  constructor(readonly summary: FreeTierUsageSummary) {
    super('Free-tier budget reached.');
    this.name = 'FreeTierBudgetExceededError';
  }
}

export type FreeTierBudgetEnvironment = 'demo' | 'production' | 'preview';

export type FreeTierBudgetBasis = {
  environment: FreeTierBudgetEnvironment;
  budgetUsd: number;
  unitCostUsd: number;
};

export type FreeTierUsageSummary = FreeTierBudgetBasis & {
  activeApplications: number;
  spendUsd: number;
  remainingUsd: number;
  percentUsed: number;
  overBudget: boolean;
};

type Env = Record<string, string | undefined>;

function readMoney(env: Env, key: string, fallback: number) {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function resolveFreeTierBudgetEnvironment(env: Env = process.env): FreeTierBudgetEnvironment {
  const explicit = (env.FREE_TIER_BUDGET_ENVIRONMENT ?? env.YAWP_ENVIRONMENT ?? env.APP_ENV ?? '').trim().toLowerCase();
  if (explicit === 'demo' || explicit === 'production' || explicit === 'preview') return explicit;
  if (env.PREVIEW_DEPLOYMENT_ID || env.RENDER_EXTERNAL_HOSTNAME?.includes('preview')) return 'preview';
  if ((env.PLATFORM_HOST ?? env.HOSTNAME ?? '').includes('demo.')) return 'demo';
  return env.NODE_ENV === 'production' ? 'production' : 'preview';
}

export function resolveFreeTierBudgetBasis(env: Env = process.env): FreeTierBudgetBasis {
  const environment = resolveFreeTierBudgetEnvironment(env);
  const prefix = environment === 'production' ? 'PRODUCTION' : environment === 'demo' ? 'DEMO' : 'PREVIEW';
  const budgetUsd = readMoney(env, `FREE_TIER_${prefix}_BUDGET_USD`, readMoney(env, 'FREE_TIER_BUDGET_USD', 250));
  const unitCostUsd = readMoney(env, `FREE_TIER_${prefix}_UNIT_COST_USD`, readMoney(env, 'FREE_TIER_UNIT_COST_USD', 2.5));
  return { environment, budgetUsd, unitCostUsd };
}

export function calculateFreeTierUsage(
  basis: FreeTierBudgetBasis,
  activeApplications: number
): FreeTierUsageSummary {
  const spendUsd = Number((Math.max(0, activeApplications) * basis.unitCostUsd).toFixed(2));
  const remainingUsd = Number(Math.max(0, basis.budgetUsd - spendUsd).toFixed(2));
  const percentUsed =
    basis.budgetUsd <= 0
      ? activeApplications > 0
        ? 100
        : 0
      : Number(Math.min(100, (spendUsd / basis.budgetUsd) * 100).toFixed(2));
  return {
    ...basis,
    activeApplications,
    spendUsd,
    remainingUsd,
    percentUsed,
    overBudget: spendUsd > basis.budgetUsd,
  };
}

export function freeTierApplicationConsumesBudget(input: {
  status: FreeTierApplicationStatus;
  releasedAt?: Date | string | null;
}) {
  return Boolean(input.releasedAt) || FREE_TIER_BUDGET_ACTIVE_STATUSES.includes(input.status);
}

export async function countFreeTierActiveApplications(
  client: Pick<Prisma.TransactionClient, 'freeTierApplication'> = prisma
) {
  return client.freeTierApplication.count({
    where: {
      OR: [
        { releasedAt: { not: null } },
        { status: { in: FREE_TIER_BUDGET_ACTIVE_STATUSES } },
      ],
    },
  });
}

export async function readFreeTierUsageSummary(
  client: Pick<Prisma.TransactionClient, 'freeTierApplication'> = prisma,
  env: Env = process.env
) {
  const basis = resolveFreeTierBudgetBasis(env);
  const activeApplications = await countFreeTierActiveApplications(client);
  return calculateFreeTierUsage(basis, activeApplications);
}

export async function assertFreeTierBudgetHeadroom(
  client: Pick<Prisma.TransactionClient, 'freeTierApplication'> = prisma,
  env: Env = process.env
) {
  const current = await readFreeTierUsageSummary(client, env);
  const after = calculateFreeTierUsage(
    { environment: current.environment, budgetUsd: current.budgetUsd, unitCostUsd: current.unitCostUsd },
    current.activeApplications + 1
  );
  if (after.overBudget) throw new FreeTierBudgetExceededError(after);
  return after;
}

export async function assertFreeTierBudgetHeadroomForTransition(
  client: Pick<Prisma.TransactionClient, 'freeTierApplication'> = prisma,
  transition: {
    from: { status: FreeTierApplicationStatus; releasedAt?: Date | string | null };
    to: { status: FreeTierApplicationStatus; releasedAt?: Date | string | null };
  },
  env: Env = process.env
) {
  const wasActive = freeTierApplicationConsumesBudget(transition.from);
  const willBeActive = freeTierApplicationConsumesBudget(transition.to);
  if (!wasActive && willBeActive) return assertFreeTierBudgetHeadroom(client, env);
  return readFreeTierUsageSummary(client, env);
}

export function freeTierBudgetRemainingActivations(summary: FreeTierUsageSummary) {
  if (summary.unitCostUsd <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(summary.remainingUsd / summary.unitCostUsd));
}

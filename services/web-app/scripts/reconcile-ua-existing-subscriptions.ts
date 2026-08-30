/**
 * Reconcile known University of Alabama Stripe subscribers into the 2026 YAWP
 * student-license cohort before enabling checkout.
 *
 * This command is intentionally dry-run by default. It validates every input
 * row before making a single write, and --apply writes the whole batch in one
 * database transaction.
 *
 * Input JSON is an explicit email-to-subscription mapping:
 *
 *   {
 *     "student@example.edu": "sub_123"
 *   }
 *
 * Usage:
 *   bun run billing:ua:import-existing -- --input ./ua-subscribers.json
 *   bun run billing:ua:import-existing -- --input ./ua-subscribers.json --apply
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const EXISTING_SUBSCRIPTION_SOURCE = 'EXISTING_SUBSCRIPTION' as const;
export const ACTIVE_LICENSE_STATUS = 'ACTIVE' as const;

const EmailSchema = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

const SubscriptionIdSchema = z
  .string()
  .trim()
  .regex(
    /^sub_[A-Za-z0-9_]+$/,
    'must be a Stripe subscription ID beginning with sub_'
  );

export type ReconciliationInput = {
  email: string;
  subscriptionId: string;
};

export type StripeSubscriptionSnapshot = {
  id: string;
  status: string;
  customer: string | { id: string } | null;
  items: Array<{ priceId: string; currency?: string | null }>;
};

export type MembershipSnapshot = {
  id: string;
  organizationId: string;
};

export type LicenseSnapshot = {
  source: string;
  status: string;
} | null;

export type ExistingSubscriptionLicensePlan = {
  email: string;
  subscriptionId: string;
  membershipId: string;
  organizationId: string;
  cohort: string;
  validUntil: Date;
  stripePriceId: string;
  stripeCustomerId: string | null;
  currency: string | null;
};

export type ReconciliationDependencies = {
  retrieveSubscription(
    subscriptionId: string
  ): Promise<StripeSubscriptionSnapshot>;
  findActiveStudentMemberships(input: {
    organizationId: string;
    normalizedEmail: string;
  }): Promise<MembershipSnapshot[]>;
  findLicense(input: {
    membershipId: string;
    cohort: string;
  }): Promise<LicenseSnapshot>;
  applyExistingSubscriptionLicenses(
    plans: ExistingSubscriptionLicensePlan[]
  ): Promise<void>;
};

export type ReconciliationConfig = {
  organizationId: string;
  allowedPriceIds: ReadonlySet<string>;
  cohort: string;
  validUntil: Date;
};

export type ReconciliationAuditRow = {
  result: 'VALIDATED' | 'APPLIED';
  email: string;
  subscriptionId: string;
  subscriptionStatus: string;
  membershipId: string;
  qualifyingPriceIds: string[];
  existingLicense: 'NONE' | 'EXISTING_SUBSCRIPTION';
  validUntil: string;
};

export function parseReconciliationInput(json: string): ReconciliationInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Input must be valid JSON');
  }

  if (!raw || Array.isArray(raw) || typeof raw !== 'object') {
    throw new Error(
      'Input must be a JSON object mapping email to subscription ID'
    );
  }

  const entries = Object.entries(raw);
  if (entries.length === 0)
    throw new Error('Input must contain at least one student');

  const normalizedEmails = new Set<string>();
  const subscriptionIds = new Set<string>();

  return entries.map(([rawEmail, rawSubscriptionId]) => {
    const email = EmailSchema.safeParse(rawEmail);
    if (!email.success) throw new Error(`Invalid student email: ${rawEmail}`);

    const subscriptionId = SubscriptionIdSchema.safeParse(rawSubscriptionId);
    if (!subscriptionId.success) {
      throw new Error(`Invalid subscription ID for ${email.data}`);
    }

    if (normalizedEmails.has(email.data)) {
      throw new Error(`Duplicate normalized student email: ${email.data}`);
    }
    if (subscriptionIds.has(subscriptionId.data)) {
      throw new Error(
        `Subscription is mapped more than once: ${subscriptionId.data}`
      );
    }

    normalizedEmails.add(email.data);
    subscriptionIds.add(subscriptionId.data);
    return { email: email.data, subscriptionId: subscriptionId.data };
  });
}

export function parseAllowedPriceIds(value: string | undefined): Set<string> {
  const ids = (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0 || ids.some((id) => !/^price_[A-Za-z0-9_]+$/.test(id))) {
    throw new Error(
      'STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS must contain comma-separated Stripe price IDs'
    );
  }
  return new Set(ids);
}

function customerIdOf(customer: StripeSubscriptionSnapshot['customer']) {
  if (typeof customer === 'string') return customer;
  return customer?.id ?? null;
}

function assertConfig(config: ReconciliationConfig, now: Date) {
  if (!config.organizationId.trim())
    throw new Error('UA_ORGANIZATION_ID is required');
  if (!config.cohort.trim())
    throw new Error('Student license cohort is required');
  if (config.allowedPriceIds.size === 0)
    throw new Error('At least one qualifying price ID is required');
  if (
    !Number.isFinite(config.validUntil.getTime()) ||
    config.validUntil <= now
  ) {
    throw new Error('Student license cutoff must be in the future');
  }
}

export async function reconcileUaExistingSubscriptions({
  input,
  config,
  dependencies,
  apply = false,
  now = new Date(),
}: {
  input: ReconciliationInput[];
  config: ReconciliationConfig;
  dependencies: ReconciliationDependencies;
  apply?: boolean;
  now?: Date;
}): Promise<ReconciliationAuditRow[]> {
  assertConfig(config, now);
  if (input.length === 0)
    throw new Error('Input must contain at least one student');

  // Validate the complete batch first. A bad row must never leave a partially
  // imported cohort or cause another student to be charged unexpectedly.
  const validated = await Promise.all(
    input.map(async ({ email, subscriptionId }) => {
      const subscription =
        await dependencies.retrieveSubscription(subscriptionId);
      if (subscription.id !== subscriptionId) {
        throw new Error(
          `Stripe returned a mismatched subscription for ${email}`
        );
      }
      if (
        subscription.status !== 'active' &&
        subscription.status !== 'trialing'
      ) {
        throw new Error(`Subscription for ${email} is not active or trialing`);
      }

      const qualifyingItems = subscription.items
        .filter((item) => config.allowedPriceIds.has(item.priceId))
        .sort((a, b) => a.priceId.localeCompare(b.priceId));
      if (qualifyingItems.length === 0) {
        throw new Error(`Subscription for ${email} has no qualifying price`);
      }

      const memberships = await dependencies.findActiveStudentMemberships({
        organizationId: config.organizationId,
        normalizedEmail: email,
      });
      if (memberships.length !== 1) {
        throw new Error(
          `Expected exactly one active UA student membership for ${email}; found ${memberships.length}`
        );
      }
      const membership = memberships[0];
      if (!membership || membership.organizationId !== config.organizationId) {
        throw new Error(`Membership organization mismatch for ${email}`);
      }

      const existingLicense = await dependencies.findLicense({
        membershipId: membership.id,
        cohort: config.cohort,
      });
      if (
        existingLicense &&
        (existingLicense.source !== EXISTING_SUBSCRIPTION_SOURCE ||
          existingLicense.status !== ACTIVE_LICENSE_STATUS)
      ) {
        throw new Error(
          `Existing ${config.cohort} license for ${email} requires manual review`
        );
      }

      const qualifyingPriceIds = [
        ...new Set(qualifyingItems.map((item) => item.priceId)),
      ];
      const primaryItem = qualifyingItems[0]!;
      const plan: ExistingSubscriptionLicensePlan = {
        email,
        subscriptionId,
        membershipId: membership.id,
        organizationId: config.organizationId,
        cohort: config.cohort,
        validUntil: config.validUntil,
        stripePriceId: primaryItem.priceId,
        stripeCustomerId: customerIdOf(subscription.customer),
        currency: primaryItem.currency?.toLowerCase() ?? null,
      };

      return {
        plan,
        audit: {
          result: (apply ? 'APPLIED' : 'VALIDATED') as 'APPLIED' | 'VALIDATED',
          email,
          subscriptionId,
          subscriptionStatus: subscription.status,
          membershipId: membership.id,
          qualifyingPriceIds,
          existingLicense: existingLicense ? 'EXISTING_SUBSCRIPTION' : 'NONE',
          validUntil: config.validUntil.toISOString(),
        } satisfies ReconciliationAuditRow,
      };
    })
  );

  if (apply) {
    await dependencies.applyExistingSubscriptionLicenses(
      validated.map(({ plan }) => plan)
    );
  }

  return validated.map(({ audit }) => audit);
}

function parseCliArgs(argv: string[]) {
  const apply = argv.includes('--apply');
  const inputIndex = argv.indexOf('--input');
  const inputPath = inputIndex >= 0 ? argv[inputIndex + 1] : undefined;
  const allowed = new Set(['--apply', '--input', inputPath].filter(Boolean));
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (!inputPath || inputPath.startsWith('--') || unknown.length > 0) {
    throw new Error(
      'Usage: billing:ua:import-existing -- --input <file.json> [--apply]'
    );
  }
  return { apply, inputPath };
}

async function runCli() {
  const { apply, inputPath } = parseCliArgs(process.argv.slice(2));
  const organizationId = process.env.UA_ORGANIZATION_ID?.trim() ?? '';
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is required');

  const allowedPriceIds = parseAllowedPriceIds(
    process.env.STRIPE_UA_EXISTING_SUBSCRIPTION_PRICE_IDS
  );
  const input = parseReconciliationInput(await readFile(inputPath, 'utf8'));

  // Runtime-only imports keep the validation/reconciliation core isolated and
  // straightforward to test without touching Stripe or a database.
  const [{ default: Stripe }, { prisma }, licenseDomain] = await Promise.all([
    import('stripe'),
    import('../app/utils/db.server'),
    import('../app/domain/student-license/student-license.server'),
  ]);
  const stripe = new Stripe(secretKey);

  try {
    const audit = await reconcileUaExistingSubscriptions({
      input,
      apply,
      config: {
        organizationId,
        allowedPriceIds,
        cohort: licenseDomain.UA_STUDENT_LICENSE_COHORT,
        validUntil: licenseDomain.UA_STUDENT_LICENSE_VALID_UNTIL,
      },
      dependencies: {
        async retrieveSubscription(subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId);
          return {
            id: subscription.id,
            status: subscription.status,
            customer: subscription.customer,
            items: subscription.items.data.map((item) => ({
              priceId: item.price.id,
              currency: item.price.currency,
            })),
          };
        },
        findActiveStudentMemberships({ organizationId, normalizedEmail }) {
          return prisma.orgMembership.findMany({
            where: {
              organizationId,
              role: 'STUDENT',
              isActive: true,
              user: {
                email: { equals: normalizedEmail, mode: 'insensitive' },
              },
            },
            select: { id: true, organizationId: true },
            take: 2,
          });
        },
        findLicense({ membershipId, cohort }) {
          return prisma.studentLicense.findUnique({
            where: { membershipId_cohort: { membershipId, cohort } },
            select: { source: true, status: true },
          });
        },
        async applyExistingSubscriptionLicenses(plans) {
          await prisma.$transaction(async (tx) => {
            for (const plan of plans) {
              const membership = await tx.orgMembership.findFirst({
                where: {
                  id: plan.membershipId,
                  organizationId: plan.organizationId,
                  role: 'STUDENT',
                  isActive: true,
                  user: { email: { equals: plan.email, mode: 'insensitive' } },
                },
                select: { id: true },
              });
              if (!membership) {
                throw new Error(
                  `Membership changed during apply for ${plan.email}`
                );
              }

              const data = {
                organizationId: plan.organizationId,
                status: ACTIVE_LICENSE_STATUS,
                source: EXISTING_SUBSCRIPTION_SOURCE,
                validUntil: plan.validUntil,
                stripePriceId: plan.stripePriceId,
                stripeCustomerId: plan.stripeCustomerId,
                currency: plan.currency,
                revokedAt: null,
              } as const;
              await tx.studentLicense.upsert({
                where: {
                  membershipId_cohort: {
                    membershipId: plan.membershipId,
                    cohort: plan.cohort,
                  },
                },
                create: {
                  membershipId: plan.membershipId,
                  cohort: plan.cohort,
                  ...data,
                },
                update: data,
              });
            }
          });
        },
      },
    });

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          count: audit.length,
          audit,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  runCli().catch((error: unknown) => {
    // Deliberately print only our bounded message, never a Stripe response,
    // request headers, environment, or stack that could expose credentials.
    console.error(
      error instanceof Error ? error.message : 'Reconciliation failed'
    );
    process.exitCode = 1;
  });
}

import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';

export const UA_STUDENT_LICENSE_COHORT = 'ua-2026';
export const UA_STUDENT_LICENSE_AMOUNT = 5_000;
export const UA_STUDENT_LICENSE_CURRENCY = 'usd';
export const UA_STUDENT_LICENSE_VALID_UNTIL = new Date(
  '2027-01-01T06:00:00.000Z'
);

export type UaStudentLicenseConfig =
  | { enabled: false }
  | {
      enabled: true;
      organizationId: string;
      priceId: string;
      secretKey: string;
      webhookSecret: string;
    };

const EnabledConfigSchema = z.object({
  UA_ORGANIZATION_ID: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_UA_2026_PRICE_ID: z.string().min(1),
});

export function getUaStudentLicenseConfig(
  env: Record<string, string | undefined> = process.env
): UaStudentLicenseConfig {
  if (env.UA_STUDENT_BILLING_ENABLED !== 'true') return { enabled: false };

  const parsed = EnabledConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid UA student billing configuration');
  }

  return {
    enabled: true,
    organizationId: parsed.data.UA_ORGANIZATION_ID,
    priceId: parsed.data.STRIPE_UA_2026_PRICE_ID,
    secretKey: parsed.data.STRIPE_SECRET_KEY,
    webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
  };
}

type MembershipForLicense = {
  id: string;
  role: string;
  organizationId: string;
};

type EntitlementForAccess = {
  cohort: string;
  status: string;
  source: string;
  validUntil: Date;
} | null;

export type UaStudentLicenseAccess = 'BYPASS' | 'ACTIVE' | 'PAYMENT_REQUIRED';

export function resolveUaStudentLicenseAccess({
  config,
  membership,
  entitlement,
  now = new Date(),
}: {
  config: UaStudentLicenseConfig;
  membership: MembershipForLicense;
  entitlement: EntitlementForAccess;
  now?: Date;
}): UaStudentLicenseAccess {
  if (!config.enabled) return 'BYPASS';
  if (
    membership.role !== 'STUDENT' ||
    membership.organizationId !== config.organizationId
  ) {
    return 'BYPASS';
  }

  if (
    entitlement?.cohort === UA_STUDENT_LICENSE_COHORT &&
    entitlement.status === 'ACTIVE' &&
    entitlement.validUntil.getTime() > now.getTime()
  ) {
    return 'ACTIVE';
  }

  return 'PAYMENT_REQUIRED';
}

export async function getUaStudentLicenseAccess(
  membership: MembershipForLicense,
  {
    config = getUaStudentLicenseConfig(),
    now = new Date(),
  }: { config?: UaStudentLicenseConfig; now?: Date } = {}
) {
  if (
    !config.enabled ||
    membership.role !== 'STUDENT' ||
    membership.organizationId !== config.organizationId
  ) {
    return 'BYPASS' as const;
  }

  const entitlement = await prisma.studentLicense.findUnique({
    where: {
      membershipId_cohort: {
        membershipId: membership.id,
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
    },
    select: {
      cohort: true,
      status: true,
      source: true,
      validUntil: true,
    },
  });

  return resolveUaStudentLicenseAccess({
    config,
    membership,
    entitlement,
    now,
  });
}

type StripeId = string | { id: string } | null;

type CheckoutSessionLike = {
  id: string;
  mode: string | null;
  payment_status: string;
  amount_total: number | null;
  currency: string | null;
  customer: StripeId;
  payment_intent: StripeId;
  metadata: Record<string, string> | null;
  line_items?: {
    data: Array<{
      price?: { id: string } | null;
      quantity?: number | null;
    }>;
  } | null;
};

function stripeId(value: StripeId): string | null {
  if (typeof value === 'string') return value;
  return value?.id ?? null;
}

type VerifiedCheckout = {
  membershipId: string;
  organizationId: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  stripeCustomerId: string | null;
  stripePriceId: string;
  cohort: typeof UA_STUDENT_LICENSE_COHORT;
  amountPaid: typeof UA_STUDENT_LICENSE_AMOUNT;
  currency: typeof UA_STUDENT_LICENSE_CURRENCY;
  validUntil: Date;
};

function verifyPaidCheckoutSession(
  session: CheckoutSessionLike,
  config: Extract<UaStudentLicenseConfig, { enabled: true }>
): VerifiedCheckout {
  if (session.payment_status !== 'paid') {
    throw new Error('Checkout Session is not paid');
  }

  const metadata = session.metadata ?? {};
  const paymentIntentId = stripeId(session.payment_intent);
  const lineItems = session.line_items?.data ?? [];
  const expectedLineItems = lineItems.filter(
    (item) => item.price?.id === config.priceId && (item.quantity ?? 1) === 1
  );

  if (
    session.mode !== 'payment' ||
    session.amount_total !== UA_STUDENT_LICENSE_AMOUNT ||
    session.currency?.toLowerCase() !== UA_STUDENT_LICENSE_CURRENCY ||
    metadata.organizationId !== config.organizationId ||
    metadata.cohort !== UA_STUDENT_LICENSE_COHORT ||
    !metadata.membershipId ||
    !paymentIntentId ||
    lineItems.length !== 1 ||
    expectedLineItems.length !== 1
  ) {
    throw new Error('Checkout Session does not match the UA license');
  }

  return {
    membershipId: metadata.membershipId,
    organizationId: metadata.organizationId,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: paymentIntentId,
    stripeCustomerId: stripeId(session.customer),
    stripePriceId: config.priceId,
    cohort: UA_STUDENT_LICENSE_COHORT,
    amountPaid: UA_STUDENT_LICENSE_AMOUNT,
    currency: UA_STUDENT_LICENSE_CURRENCY,
    validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
  };
}

type FulfillmentDependencies = {
  retrieveCheckoutSession: (id: string) => Promise<CheckoutSessionLike>;
  findMembership: (membershipId: string, organizationId: string) => Promise<MembershipForLicense | null>;
  activate: (checkout: VerifiedCheckout) => Promise<{ id: string }>;
};

let stripeClient: Stripe | null = null;
let stripeClientKey: string | null = null;

function getStripe(config: Extract<UaStudentLicenseConfig, { enabled: true }>) {
  if (!stripeClient || stripeClientKey !== config.secretKey) {
    stripeClient = new Stripe(config.secretKey);
    stripeClientKey = config.secretKey;
  }
  return stripeClient;
}

function defaultFulfillmentDependencies(
  config: Extract<UaStudentLicenseConfig, { enabled: true }>
): FulfillmentDependencies {
  const stripe = getStripe(config);
  return {
    async retrieveCheckoutSession(id) {
      return (await stripe.checkout.sessions.retrieve(id, {
        expand: ['line_items.data.price'],
      })) as CheckoutSessionLike;
    },
    findMembership(membershipId, organizationId) {
      return prisma.orgMembership.findFirst({
        where: {
          id: membershipId,
          organizationId,
          role: 'STUDENT',
        },
        select: { id: true, organizationId: true, role: true },
      });
    },
    activate(checkout) {
      const paidAt = new Date();
      return prisma.studentLicense.upsert({
        where: {
          membershipId_cohort: {
            membershipId: checkout.membershipId,
            cohort: checkout.cohort,
          },
        },
        create: {
          membershipId: checkout.membershipId,
          organizationId: checkout.organizationId,
          cohort: checkout.cohort,
          status: 'ACTIVE',
          source: 'STRIPE_CHECKOUT',
          validUntil: checkout.validUntil,
          amountPaid: checkout.amountPaid,
          currency: checkout.currency,
          stripePriceId: checkout.stripePriceId,
          stripeCustomerId: checkout.stripeCustomerId,
          stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
          stripePaymentIntentId: checkout.stripePaymentIntentId,
          paidAt,
          revokedAt: null,
        },
        update: {
          status: 'ACTIVE',
          source: 'STRIPE_CHECKOUT',
          validUntil: checkout.validUntil,
          amountPaid: checkout.amountPaid,
          currency: checkout.currency,
          stripePriceId: checkout.stripePriceId,
          stripeCustomerId: checkout.stripeCustomerId,
          stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
          stripePaymentIntentId: checkout.stripePaymentIntentId,
          paidAt,
          revokedAt: null,
        },
        select: { id: true },
      });
    },
  };
}

export async function fulfillCheckoutSession(
  checkoutSessionId: string,
  options: {
    config?: UaStudentLicenseConfig;
    dependencies?: FulfillmentDependencies;
  } = {}
) {
  const config = options.config ?? getUaStudentLicenseConfig();
  if (!config.enabled) throw new Error('UA student billing is disabled');

  const dependencies =
    options.dependencies ?? defaultFulfillmentDependencies(config);
  const session = await dependencies.retrieveCheckoutSession(checkoutSessionId);
  const checkout = verifyPaidCheckoutSession(session, config);
  const membership = await dependencies.findMembership(
    checkout.membershipId,
    checkout.organizationId
  );

  if (
    !membership ||
    membership.role !== 'STUDENT' ||
    membership.organizationId !== config.organizationId
  ) {
    throw new Error('Checkout Session membership is not eligible');
  }

  const license = await dependencies.activate(checkout);
  return { licenseId: license.id, membershipId: membership.id };
}

type CheckoutCreationDependencies = {
  findMembership: (membershipId: string) => Promise<
    | (MembershipForLicense & {
        user: { email: string };
      })
    | null
  >;
  findOrCreateLicense: (membership: MembershipForLicense) => Promise<{
    id: string;
    status: string;
    validUntil: Date;
    checkoutAttempt: number;
    stripeCheckoutSessionId: string | null;
  }>;
  retrieveCheckoutSession: (id: string) => Promise<{
    id: string;
    status: string | null;
    payment_status: string;
    url: string | null;
  }>;
  incrementAttempt: (licenseId: string) => Promise<number>;
  createCheckoutSession: (args: {
    membership: MembershipForLicense & { user: { email: string } };
    attempt: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) => Promise<{ id: string; url: string | null }>;
  attachCheckoutSession: (licenseId: string, sessionId: string) => Promise<void>;
};

function defaultCheckoutCreationDependencies(
  config: Extract<UaStudentLicenseConfig, { enabled: true }>
): CheckoutCreationDependencies {
  const stripe = getStripe(config);
  return {
    findMembership(membershipId) {
      return prisma.orgMembership.findFirst({
        where: {
          id: membershipId,
          organizationId: config.organizationId,
          role: 'STUDENT',
        },
        select: {
          id: true,
          organizationId: true,
          role: true,
          user: { select: { email: true } },
        },
      });
    },
    findOrCreateLicense(membership) {
      return prisma.studentLicense.upsert({
        where: {
          membershipId_cohort: {
            membershipId: membership.id,
            cohort: UA_STUDENT_LICENSE_COHORT,
          },
        },
        create: {
          membershipId: membership.id,
          organizationId: membership.organizationId,
          cohort: UA_STUDENT_LICENSE_COHORT,
          status: 'PENDING',
          source: 'STRIPE_CHECKOUT',
          validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
        },
        update: {},
        select: {
          id: true,
          status: true,
          validUntil: true,
          checkoutAttempt: true,
          stripeCheckoutSessionId: true,
        },
      });
    },
    async retrieveCheckoutSession(id) {
      const session = await stripe.checkout.sessions.retrieve(id);
      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        url: session.url,
      };
    },
    async incrementAttempt(licenseId) {
      const license = await prisma.studentLicense.update({
        where: { id: licenseId },
        data: {
          checkoutAttempt: { increment: 1 },
          stripeCheckoutSessionId: null,
        },
        select: { checkoutAttempt: true },
      });
      return license.checkoutAttempt;
    },
    async createCheckoutSession({
      membership,
      attempt,
      successUrl,
      cancelUrl,
      idempotencyKey,
    }) {
      const metadata = {
        membershipId: membership.id,
        organizationId: membership.organizationId,
        cohort: UA_STUDENT_LICENSE_COHORT,
      };
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [{ price: config.priceId, quantity: 1 }],
          customer_email: membership.user.email,
          client_reference_id: membership.id,
          metadata,
          payment_intent_data: { metadata },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `${idempotencyKey}:${attempt}` }
      );
      return { id: session.id, url: session.url };
    },
    async attachCheckoutSession(licenseId, sessionId) {
      await prisma.studentLicense.update({
        where: { id: licenseId },
        data: { stripeCheckoutSessionId: sessionId },
      });
    },
  };
}

export async function createOrReuseCheckoutSession({
  membershipId,
  successUrl,
  cancelUrl,
  config = getUaStudentLicenseConfig(),
  dependencies,
  now = new Date(),
}: {
  membershipId: string;
  successUrl: string;
  cancelUrl: string;
  config?: UaStudentLicenseConfig;
  dependencies?: CheckoutCreationDependencies;
  now?: Date;
}): Promise<{ kind: 'ACTIVE' } | { kind: 'CHECKOUT'; url: string }> {
  if (!config.enabled) throw new Error('UA student billing is disabled');
  const deps = dependencies ?? defaultCheckoutCreationDependencies(config);
  const membership = await deps.findMembership(membershipId);
  if (!membership) throw new Error('Membership is not eligible for UA billing');

  const license = await deps.findOrCreateLicense(membership);
  if (
    license.status === 'ACTIVE' &&
    license.validUntil.getTime() > now.getTime()
  ) {
    return { kind: 'ACTIVE' };
  }

  if (license.stripeCheckoutSessionId) {
    const existing = await deps.retrieveCheckoutSession(
      license.stripeCheckoutSessionId
    );
    if (existing.status === 'open' && existing.url) {
      return { kind: 'CHECKOUT', url: existing.url };
    }
    if (existing.status === 'complete' && existing.payment_status === 'paid') {
      await fulfillCheckoutSession(existing.id, { config });
      return { kind: 'ACTIVE' };
    }
  }

  const attempt = await deps.incrementAttempt(license.id);
  const session = await deps.createCheckoutSession({
    membership,
    attempt,
    successUrl,
    cancelUrl,
    idempotencyKey: `${UA_STUDENT_LICENSE_COHORT}:${license.id}`,
  });
  if (!session.url) throw new Error('Stripe did not return a Checkout URL');
  await deps.attachCheckoutSession(license.id, session.id);
  return { kind: 'CHECKOUT', url: session.url };
}

type RevocationStatus = 'REFUNDED' | 'DISPUTED' | 'REVOKED';

type StripeWebhookTransition =
  | { kind: 'IGNORE' }
  | { kind: 'ACTIVATE'; checkout: VerifiedCheckout }
  | {
      kind: 'REVOKE';
      paymentIntentId: string;
      status: RevocationStatus;
    };

type WebhookTransaction = {
  recordEvent: (eventId: string, eventType: string) => Promise<unknown>;
  activate: (checkout: VerifiedCheckout) => Promise<unknown>;
  revoke: (
    paymentIntentId: string,
    status: RevocationStatus
  ) => Promise<unknown>;
};

type WebhookTransitionDependencies = {
  transaction: (
    work: (transaction: WebhookTransaction) => Promise<void>
  ) => Promise<void>;
};

function activationCreateData(checkout: VerifiedCheckout) {
  return {
    membershipId: checkout.membershipId,
    organizationId: checkout.organizationId,
    cohort: checkout.cohort,
    status: 'ACTIVE' as const,
    source: 'STRIPE_CHECKOUT' as const,
    validUntil: checkout.validUntil,
    amountPaid: checkout.amountPaid,
    currency: checkout.currency,
    stripePriceId: checkout.stripePriceId,
    stripeCustomerId: checkout.stripeCustomerId,
    stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
    stripePaymentIntentId: checkout.stripePaymentIntentId,
    paidAt: new Date(),
  };
}

function activationUpdateData(checkout: VerifiedCheckout) {
  return { ...activationCreateData(checkout), revokedAt: null };
}

function defaultWebhookTransitionDependencies(): WebhookTransitionDependencies {
  return {
    transaction(work) {
      return prisma.$transaction(async (tx) => {
        await work({
          recordEvent(eventId, eventType) {
            return tx.stripeWebhookEvent.create({
              data: { id: eventId, type: eventType },
            });
          },
          activate(checkout) {
            return tx.studentLicense.upsert({
              where: {
                membershipId_cohort: {
                  membershipId: checkout.membershipId,
                  cohort: checkout.cohort,
                },
              },
              create: activationCreateData(checkout),
              update: activationUpdateData(checkout),
            });
          },
          revoke(paymentIntentId, status) {
            return tx.studentLicense.updateMany({
              where: { stripePaymentIntentId: paymentIntentId },
              data: { status, revokedAt: new Date() },
            });
          },
        });
      });
    },
  };
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function applyStripeWebhookTransition(
  {
    eventId,
    eventType,
    transition,
  }: {
    eventId: string;
    eventType: string;
    transition: StripeWebhookTransition;
  },
  dependencies: WebhookTransitionDependencies =
    defaultWebhookTransitionDependencies()
): Promise<{ duplicate: boolean; handled: boolean }> {
  const handled = transition.kind !== 'IGNORE';
  try {
    await dependencies.transaction(async (tx) => {
      await tx.recordEvent(eventId, eventType);
      if (transition.kind === 'ACTIVATE') {
        await tx.activate(transition.checkout);
      } else if (transition.kind === 'REVOKE') {
        await tx.revoke(transition.paymentIntentId, transition.status);
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return { duplicate: true, handled };
    throw error;
  }

  return { duplicate: false, handled };
}

function paymentIntentIdFromEvent(event: Stripe.Event): string | null {
  if (event.type === 'charge.refunded') {
    return stripeId((event.data.object as Stripe.Charge).payment_intent);
  }
  if (
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.closed'
  ) {
    return stripeId((event.data.object as Stripe.Dispute).payment_intent);
  }
  return null;
}

function statusFromEvent(event: Stripe.Event): RevocationStatus | null {
  if (event.type === 'charge.refunded') return 'REFUNDED';
  if (event.type === 'charge.dispute.created') return 'DISPUTED';
  if (event.type === 'charge.dispute.closed') return 'REVOKED';
  return null;
}

export async function processStripeWebhook(
  rawBody: string,
  signature: string,
  config: UaStudentLicenseConfig = getUaStudentLicenseConfig()
): Promise<{ duplicate: boolean; handled: boolean }> {
  if (!config.enabled) throw new Error('UA student billing is disabled');
  const stripe = getStripe(config);
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    config.webhookSecret
  );

  const alreadyProcessed = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
    select: { id: true },
  });
  if (alreadyProcessed) return { duplicate: true, handled: true };

  let checkout: VerifiedCheckout | null = null;
  if (
    event.type === 'checkout.session.completed' ||
    event.type === 'checkout.session.async_payment_succeeded'
  ) {
    const session = await stripe.checkout.sessions.retrieve(
      (event.data.object as Stripe.Checkout.Session).id,
      { expand: ['line_items.data.price'] }
    );
    if (session.payment_status === 'paid') {
      checkout = verifyPaidCheckoutSession(
        session as CheckoutSessionLike,
        config
      );
      const membership = await prisma.orgMembership.findFirst({
        where: {
          id: checkout.membershipId,
          organizationId: config.organizationId,
          role: 'STUDENT',
        },
        select: { id: true },
      });
      if (!membership) {
        throw new Error('Checkout Session membership is not eligible');
      }
    }
  }

  const revocationStatus = statusFromEvent(event);
  const paymentIntentId = paymentIntentIdFromEvent(event);
  const transition: StripeWebhookTransition = checkout
    ? { kind: 'ACTIVATE', checkout }
    : revocationStatus && paymentIntentId
      ? { kind: 'REVOKE', paymentIntentId, status: revocationStatus }
      : { kind: 'IGNORE' };

  return applyStripeWebhookTransition({
    eventId: event.id,
    eventType: event.type,
    transition,
  });
}

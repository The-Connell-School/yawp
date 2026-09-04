import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';

export const UA_STUDENT_LICENSE_COHORT = 'ua-2026';
export const UA_STUDENT_LICENSE_AMOUNT = 3_500;
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
      applicationOrigin: string;
    };

const EnabledConfigSchema = z.object({
  UA_ORGANIZATION_ID: z.string().min(1),
  UA_PARTNER_HOSTNAME: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_UA_2026_PRICE_ID: z.string().min(1),
  YAWP_APP_ORIGIN: z.string().url(),
});

export function getUaStudentLicenseConfig(
  env: Record<string, string | undefined> = process.env
): UaStudentLicenseConfig {
  if (env.UA_STUDENT_BILLING_ENABLED !== 'true') return { enabled: false };

  const parsed = EnabledConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid UA student billing configuration');
  }

  const applicationUrl = new URL(parsed.data.YAWP_APP_ORIGIN);
  if (
    (applicationUrl.protocol !== 'https:' &&
      applicationUrl.protocol !== 'http:') ||
    applicationUrl.username ||
    applicationUrl.password ||
    applicationUrl.hostname.toLowerCase() !==
      parsed.data.UA_PARTNER_HOSTNAME.toLowerCase() ||
    applicationUrl.pathname !== '/' ||
    applicationUrl.search ||
    applicationUrl.hash
  ) {
    throw new Error('Invalid UA student billing configuration');
  }

  return {
    enabled: true,
    organizationId: parsed.data.UA_ORGANIZATION_ID,
    priceId: parsed.data.STRIPE_UA_2026_PRICE_ID,
    secretKey: parsed.data.STRIPE_SECRET_KEY,
    webhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
    applicationOrigin: applicationUrl.origin,
  };
}

export function getUaStudentLicenseNow(
  env: Record<string, string | undefined> = process.env
) {
  if (env.E2E !== 'true' || !env.E2E_UA_NOW) return new Date();
  const now = new Date(env.E2E_UA_NOW);
  if (Number.isNaN(now.getTime())) throw new Error('Invalid E2E UA clock');
  return now;
}

export function isUaStudentLicenseSalesClosed(now = getUaStudentLicenseNow()) {
  return now.getTime() >= UA_STUDENT_LICENSE_VALID_UNTIL.getTime();
}

export function assertStripeModeAllowed(
  livemode: boolean,
  env: Record<string, string | undefined> = process.env
) {
  if (
    env.NODE_ENV === 'production' &&
    env.YAWP_ENVIRONMENT !== 'preview' &&
    !livemode
  ) {
    throw new Error('Stripe test-mode data is not allowed in production');
  }
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
  now = getUaStudentLicenseNow(),
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
    now = getUaStudentLicenseNow(),
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

export async function getUaStudentLicenseBillingState(
  membership: MembershipForLicense,
  config: UaStudentLicenseConfig = getUaStudentLicenseConfig()
): Promise<'PAYMENT_REQUIRED' | 'SUSPENDED'> {
  if (
    !config.enabled ||
    membership.role !== 'STUDENT' ||
    membership.organizationId !== config.organizationId
  ) {
    return 'PAYMENT_REQUIRED';
  }
  const license = await prisma.studentLicense.findUnique({
    where: {
      membershipId_cohort: {
        membershipId: membership.id,
        cohort: UA_STUDENT_LICENSE_COHORT,
      },
    },
    select: { status: true },
  });
  return license?.status === 'DISPUTED' ? 'SUSPENDED' : 'PAYMENT_REQUIRED';
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
      price?: {
        id: string;
        product?: StripeId;
        unit_amount?: number | null;
        currency?: string;
        type?: string;
      } | null;
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
  amountPaid: number;
  currency: typeof UA_STUDENT_LICENSE_CURRENCY;
  validUntil: Date;
};

function verifyPaidCheckoutSession(
  session: CheckoutSessionLike,
  config: Extract<UaStudentLicenseConfig, { enabled: true }>,
  productId?: string | null
): VerifiedCheckout {
  if (session.payment_status !== 'paid') {
    throw new Error('Checkout Session is not paid');
  }

  const metadata = session.metadata ?? {};
  const paymentIntentId = stripeId(session.payment_intent);
  const lineItems = session.line_items?.data ?? [];
  const expectedLineItems = lineItems.filter(
    (item) =>
      (item.quantity ?? 1) === 1 &&
      (item.price?.id === config.priceId ||
        (Boolean(productId) &&
          stripeId(item.price?.product ?? null) === productId &&
          item.price?.type === 'one_time' &&
          item.price.currency?.toLowerCase() === UA_STUDENT_LICENSE_CURRENCY &&
          item.price.unit_amount === session.amount_total))
  );

  if (
    session.mode !== 'payment' ||
    !isSupportedUaPaymentAmount(session.amount_total) ||
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
    stripePriceId: expectedLineItems[0]!.price!.id,
    cohort: UA_STUDENT_LICENSE_COHORT,
    amountPaid: session.amount_total!,
    currency: UA_STUDENT_LICENSE_CURRENCY,
    validUntil: UA_STUDENT_LICENSE_VALID_UNTIL,
  };
}

type CheckoutVerificationDependencies = {
  retrieveConfiguredProductId?: () => Promise<string | null>;
  retrieveCheckoutSession: (id: string) => Promise<CheckoutSessionLike>;
  findMembership: (
    membershipId: string,
    organizationId: string
  ) => Promise<MembershipForLicense | null>;
};

let stripeClient: Stripe | null = null;
let stripeClientKey: string | null = null;

export function getE2EStripeClientOptions(
  env: Record<string, string | undefined> = process.env
) {
  if (env.E2E !== 'true' || !env.E2E_STRIPE_API_BASE) return null;

  const url = new URL(env.E2E_STRIPE_API_BASE);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid E2E Stripe API base');
  }

  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    protocol:
      url.protocol === 'https:' ? ('https' as const) : ('http' as const),
  };
}

function getStripe(config: Extract<UaStudentLicenseConfig, { enabled: true }>) {
  const e2eOptions = getE2EStripeClientOptions();
  const clientKey = `${config.secretKey}:${e2eOptions ? `${e2eOptions.protocol}://${e2eOptions.host}:${e2eOptions.port}` : 'stripe'}`;
  if (!stripeClient || stripeClientKey !== clientKey) {
    stripeClient = new Stripe(config.secretKey, e2eOptions ?? undefined);
    stripeClientKey = clientKey;
  }
  return stripeClient;
}

function defaultCheckoutVerificationDependencies(
  config: Extract<UaStudentLicenseConfig, { enabled: true }>
): CheckoutVerificationDependencies {
  const stripe = getStripe(config);
  return {
    async retrieveConfiguredProductId() {
      return stripeId((await stripe.prices.retrieve(config.priceId)).product);
    },
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
  };
}

/**
 * Verifies the success-return Session and its owner without granting access.
 * License activation is deliberately restricted to signed Stripe webhooks.
 */
export async function verifyCheckoutSessionForReturn(
  checkoutSessionId: string,
  options: {
    config?: UaStudentLicenseConfig;
    dependencies?: CheckoutVerificationDependencies;
  } = {}
) {
  const config = options.config ?? getUaStudentLicenseConfig();
  if (!config.enabled) throw new Error('UA student billing is disabled');

  const dependencies =
    options.dependencies ?? defaultCheckoutVerificationDependencies(config);
  const session = await dependencies.retrieveCheckoutSession(checkoutSessionId);
  const checkout = verifyPaidCheckoutSession(
    session,
    config,
    await dependencies.retrieveConfiguredProductId?.()
  );
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

  return { membershipId: membership.id };
}

function isSupportedUaPaymentAmount(amount: number | null | undefined) {
  // Previously completed USD 50 purchases remain valid during the price rollover.
  return amount === UA_STUDENT_LICENSE_AMOUNT || amount === 5_000;
}

export async function resolveUaCheckoutPrice(
  config: Extract<UaStudentLicenseConfig, { enabled: true }>,
  stripe: Pick<Stripe, 'prices' | 'products'> = getStripe(config)
): Promise<string> {
  const anchor = await stripe.prices.retrieve(config.priceId);
  assertStripeModeAllowed(anchor.livemode);
  const productId = stripeId(anchor.product);
  if (!productId) throw new Error('Configured Stripe price has no product');
  const product = await stripe.products.retrieve(productId, {
    expand: ['default_price'],
  });
  if ('deleted' in product || !product.active)
    throw new Error('UA Stripe product is unavailable');
  assertStripeModeAllowed(product.livemode);
  const price =
    typeof product.default_price === 'string'
      ? await stripe.prices.retrieve(product.default_price)
      : product.default_price;
  if (
    !price ||
    !price.active ||
    price.type !== 'one_time' ||
    price.currency.toLowerCase() !== UA_STUDENT_LICENSE_CURRENCY ||
    price.unit_amount !== UA_STUDENT_LICENSE_AMOUNT ||
    stripeId(price.product) !== productId
  ) {
    throw new Error('UA Stripe default price must be active, one-time, USD 35');
  }
  assertStripeModeAllowed(price.livemode);
  return price.id;
}

type CheckoutCreationDependencies = {
  resolveCheckoutPrice: () => Promise<string>;
  expireCheckoutSession: (id: string) => Promise<void>;
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
    amount_total?: number | null;
    currency?: string | null;
    line_items?: CheckoutSessionLike['line_items'];
  }>;
  prepareAttempt: (license: {
    id: string;
    checkoutAttempt: number;
    stripeCheckoutSessionId: string | null;
  }) => Promise<number>;
  createCheckoutSession: (args: {
    priceId: string;
    membership: MembershipForLicense & { user: { email: string } };
    attempt: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) => Promise<{ id: string; url: string | null }>;
  attachCheckoutSession: (
    licenseId: string,
    sessionId: string
  ) => Promise<void>;
};

function defaultCheckoutCreationDependencies(
  config: Extract<UaStudentLicenseConfig, { enabled: true }>
): CheckoutCreationDependencies {
  const stripe = getStripe(config);
  return {
    resolveCheckoutPrice: () => resolveUaCheckoutPrice(config, stripe),
    async expireCheckoutSession(id) {
      await stripe.checkout.sessions.expire(id);
    },
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
    async findOrCreateLicense(membership) {
      const query = {
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
      } as const;
      try {
        return await prisma.studentLicense.upsert(query);
      } catch (error) {
        // Prisma's read-then-create upsert can lose a simultaneous first-click
        // race. The unique membership/cohort key identifies the winner, so all
        // losing requests safely continue with that same pending license and
        // therefore the same Stripe idempotency key.
        if (!isUniqueConstraintError(error)) throw error;
        const winner = await prisma.studentLicense.findUnique({
          where: query.where,
          select: query.select,
        });
        if (!winner) throw error;
        return winner;
      }
    },
    async retrieveCheckoutSession(id) {
      const session = await stripe.checkout.sessions.retrieve(id, {
        expand: ['line_items.data.price'],
      });
      return {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        url: session.url,
        amount_total: session.amount_total,
        currency: session.currency,
        line_items: session.line_items,
      };
    },
    async prepareAttempt(license) {
      // Parallel first requests intentionally share attempt zero, and therefore
      // the same Stripe idempotency key. Only an expired/completed prior Session
      // advances the attempt. The compare-and-swap lets concurrent retries share
      // the winner's next key instead of creating two payable Sessions.
      if (!license.stripeCheckoutSessionId) return license.checkoutAttempt;

      await prisma.studentLicense.updateMany({
        where: {
          id: license.id,
          checkoutAttempt: license.checkoutAttempt,
          stripeCheckoutSessionId: license.stripeCheckoutSessionId,
        },
        data: {
          checkoutAttempt: { increment: 1 },
          stripeCheckoutSessionId: null,
        },
      });
      const prepared = await prisma.studentLicense.findUnique({
        where: { id: license.id },
        select: { checkoutAttempt: true },
      });
      if (!prepared) throw new Error('Student license no longer exists');
      return prepared.checkoutAttempt;
    },
    async createCheckoutSession({
      priceId,
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
          line_items: [{ price: priceId, quantity: 1 }],
          customer_email: membership.user.email,
          client_reference_id: membership.id,
          metadata,
          payment_intent_data: { metadata },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
        { idempotencyKey: `${idempotencyKey}:${priceId}:${attempt}` }
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
  now = getUaStudentLicenseNow(),
}: {
  membershipId: string;
  successUrl: string;
  cancelUrl: string;
  config?: UaStudentLicenseConfig;
  dependencies?: CheckoutCreationDependencies;
  now?: Date;
}): Promise<
  | { kind: 'ACTIVE' }
  | { kind: 'CLOSED' }
  | { kind: 'PROCESSING' }
  | { kind: 'SUSPENDED' }
  | { kind: 'CHECKOUT'; url: string }
> {
  if (!config.enabled) throw new Error('UA student billing is disabled');
  const deps = dependencies ?? defaultCheckoutCreationDependencies(config);
  const membership = await deps.findMembership(membershipId);
  if (!membership) throw new Error('Membership is not eligible for UA billing');

  if (isUaStudentLicenseSalesClosed(now)) return { kind: 'CLOSED' };

  const license = await deps.findOrCreateLicense(membership);
  if (
    license.status === 'ACTIVE' &&
    license.validUntil.getTime() > now.getTime()
  ) {
    return { kind: 'ACTIVE' };
  }

  // An unresolved dispute is not a failed purchase. Opening another Checkout
  // could charge the student twice if Stripe later reinstates the first funds.
  if (license.status === 'DISPUTED') return { kind: 'SUSPENDED' };

  let priceId: string | undefined;
  const isTerminal = ['REFUNDED', 'REVOKED'].includes(license.status);
  if (license.stripeCheckoutSessionId && !isTerminal) {
    const existing = await deps.retrieveCheckoutSession(
      license.stripeCheckoutSessionId
    );
    // A completed Session, including a delayed payment, must never open a second charge.
    if (existing.status === 'complete') return { kind: 'PROCESSING' };
    if (existing.status === 'open') {
      priceId = await deps.resolveCheckoutPrice();
      const items = existing.line_items?.data ?? [];
      if (
        existing.url &&
        existing.amount_total === UA_STUDENT_LICENSE_AMOUNT &&
        existing.currency === UA_STUDENT_LICENSE_CURRENCY &&
        items.length === 1 &&
        items[0]?.price?.id === priceId &&
        items[0]?.quantity === 1
      ) {
        return { kind: 'CHECKOUT', url: existing.url };
      }
      // Stripe Sessions retain their original line items after a catalog change.
      // Close the stale payable Session before advancing the idempotent attempt.
      try {
        await deps.expireCheckoutSession(existing.id);
      } catch (error) {
        const latest = await deps.retrieveCheckoutSession(existing.id);
        if (latest.status === 'complete') return { kind: 'PROCESSING' };
        // Another concurrent retry may have expired it first.
        if (latest.status !== 'expired') throw error;
      }
    }
  }

  priceId ??= await deps.resolveCheckoutPrice();
  const attempt = await deps.prepareAttempt(license);
  const session = await deps.createCheckoutSession({
    priceId,
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

type StripeLicenseStatus = 'ACTIVE' | 'REFUNDED' | 'DISPUTED' | 'REVOKED';

type StripeWebhookTransition =
  | { kind: 'IGNORE' }
  | {
      kind: 'RECONCILE';
      paymentIntentId: string;
      checkout: VerifiedCheckout | null;
    };

type WebhookTransaction = {
  recordEvent: (eventId: string, eventType: string) => Promise<unknown>;
  lockPaymentIntent: (paymentIntentId: string) => Promise<unknown>;
  reconcile: (
    checkout: VerifiedCheckout | null,
    paymentIntentId: string,
    status: StripeLicenseStatus
  ) => Promise<unknown>;
};

type WebhookTransitionDependencies = {
  transaction: (
    work: (transaction: WebhookTransaction) => Promise<void>
  ) => Promise<void>;
  eventExists: (eventId: string) => Promise<boolean>;
  retrievePaymentSnapshot: (
    paymentIntentId: string
  ) => Promise<StripePaymentSnapshot>;
};

function reconciliationData(
  checkout: VerifiedCheckout,
  status: StripeLicenseStatus
) {
  const now = new Date();
  return {
    status,
    source: 'STRIPE_CHECKOUT' as const,
    validUntil: checkout.validUntil,
    amountPaid: checkout.amountPaid,
    currency: checkout.currency,
    stripePriceId: checkout.stripePriceId,
    stripeCustomerId: checkout.stripeCustomerId,
    stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
    stripePaymentIntentId: checkout.stripePaymentIntentId,
    paidAt: now,
    revokedAt: status === 'ACTIVE' ? null : now,
  };
}

function defaultWebhookTransitionDependencies(
  retrievePaymentSnapshot: (
    paymentIntentId: string
  ) => Promise<StripePaymentSnapshot>
): WebhookTransitionDependencies {
  return {
    transaction(work) {
      return prisma.$transaction(
        async (tx) => {
          await work({
            recordEvent(eventId, eventType) {
              return tx.stripeWebhookEvent.create({
                data: { id: eventId, type: eventType },
              });
            },
            lockPaymentIntent(paymentIntentId) {
              return tx.$queryRaw`
                SELECT pg_advisory_xact_lock(
                  hashtextextended(${paymentIntentId}, 0)
                )::text AS "lock"
              `;
            },
            reconcile(checkout, paymentIntentId, status) {
              if (checkout) {
                // Checkout can activate only the exact Session currently attached
                // to this license. A late webhook from a refunded/retried Session
                // is therefore harmless after a newer attempt has been attached.
                return tx.studentLicense.updateMany({
                  where: {
                    membershipId: checkout.membershipId,
                    cohort: checkout.cohort,
                    stripeCheckoutSessionId: checkout.stripeCheckoutSessionId,
                  },
                  data: reconciliationData(checkout, status),
                });
              }
              return tx.studentLicense.updateMany({
                where: { stripePaymentIntentId: paymentIntentId },
                data: {
                  status,
                  revokedAt: status === 'ACTIVE' ? null : new Date(),
                },
              });
            },
          });
        },
        // Stripe is deliberately refreshed while holding the per-payment lock.
        // Allow ordinary API latency without using Prisma's short interactive
        // transaction default as an accidental webhook failure mode.
        { timeout: 30_000 }
      );
    },
    async eventExists(eventId) {
      return Boolean(
        await prisma.stripeWebhookEvent.findUnique({
          where: { id: eventId },
          select: { id: true },
        })
      );
    },
    retrievePaymentSnapshot,
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
  dependencies: WebhookTransitionDependencies
): Promise<{ duplicate: boolean; handled: boolean }> {
  const handled = transition.kind !== 'IGNORE';
  try {
    await dependencies.transaction(async (tx) => {
      await tx.recordEvent(eventId, eventType);
      if (transition.kind === 'RECONCILE') {
        // The transaction-scoped advisory lock serializes every event for this
        // PaymentIntent. Stripe is refreshed only after taking the lock, so a
        // delayed handler cannot commit a stale pre-lock snapshot last.
        await tx.lockPaymentIntent(transition.paymentIntentId);
        const status = resolveStripeLicenseStatus(
          await dependencies.retrievePaymentSnapshot(transition.paymentIntentId)
        );
        await tx.reconcile(
          transition.checkout,
          transition.paymentIntentId,
          status
        );
      }
    });
  } catch (error) {
    if (
      isUniqueConstraintError(error) &&
      (await dependencies.eventExists(eventId))
    ) {
      return { duplicate: true, handled };
    }
    throw error;
  }

  return { duplicate: false, handled };
}

export function paymentIntentIdFromReconciliationEvent(
  event: Stripe.Event
): string | null {
  if (event.type === 'charge.refunded') {
    return stripeId((event.data.object as Stripe.Charge).payment_intent);
  }
  if (
    event.type === 'charge.dispute.created' ||
    event.type === 'charge.dispute.closed' ||
    event.type === 'charge.dispute.updated' ||
    event.type === 'charge.dispute.funds_reinstated' ||
    event.type === 'charge.dispute.funds_withdrawn'
  ) {
    return stripeId((event.data.object as Stripe.Dispute).payment_intent);
  }
  return null;
}

export function isStripePaymentReconciliationEvent(type: Stripe.Event.Type) {
  return (
    type === 'charge.refunded' ||
    type === 'charge.dispute.created' ||
    type === 'charge.dispute.closed' ||
    type === 'charge.dispute.updated' ||
    type === 'charge.dispute.funds_reinstated' ||
    type === 'charge.dispute.funds_withdrawn'
  );
}

export type StripePaymentSnapshot = {
  paymentIntentStatus: string;
  charge: {
    paid: boolean;
    amount: number;
    amountRefunded: number;
    currency: string;
    disputed: boolean;
  } | null;
  disputeStatuses: string[];
};

/**
 * Derives entitlement from Stripe's current payment state, not event order.
 * Partial refunds intentionally retain access; only a full refund revokes it.
 */
export function resolveStripeLicenseStatus(
  snapshot: StripePaymentSnapshot
): StripeLicenseStatus {
  const charge = snapshot.charge;
  if (
    snapshot.paymentIntentStatus !== 'succeeded' ||
    !charge?.paid ||
    !isSupportedUaPaymentAmount(charge.amount) ||
    charge.currency.toLowerCase() !== UA_STUDENT_LICENSE_CURRENCY
  ) {
    return 'REVOKED';
  }
  if (charge.amountRefunded >= charge.amount) return 'REFUNDED';

  if (snapshot.disputeStatuses.includes('lost')) return 'REVOKED';
  const unresolvedDispute = snapshot.disputeStatuses.some(
    (status) =>
      status !== 'won' && status !== 'warning_closed' && status !== 'prevented'
  );
  if (unresolvedDispute) return 'DISPUTED';
  if (charge.disputed && snapshot.disputeStatuses.length === 0) {
    return 'DISPUTED';
  }

  return 'ACTIVE';
}

async function retrieveStripePaymentSnapshot(
  stripe: Stripe,
  paymentIntentId: string
): Promise<StripePaymentSnapshot> {
  const [paymentIntent, disputes] = await Promise.all([
    stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    }),
    stripe.disputes.list({ payment_intent: paymentIntentId, limit: 100 }),
  ]);
  const charge =
    paymentIntent.latest_charge &&
    typeof paymentIntent.latest_charge !== 'string'
      ? paymentIntent.latest_charge
      : null;
  return {
    paymentIntentStatus: paymentIntent.status,
    charge: charge
      ? {
          paid: charge.paid,
          amount: charge.amount,
          amountRefunded: charge.amount_refunded,
          currency: charge.currency,
          disputed: charge.disputed,
        }
      : null,
    disputeStatuses: disputes.data.map((dispute) => dispute.status),
  };
}

export async function processStripeWebhook(
  rawBody: string,
  signature: string,
  config: UaStudentLicenseConfig = getUaStudentLicenseConfig()
): Promise<{ duplicate: boolean; handled: boolean }> {
  if (!config.enabled) throw new Error('UA student billing is disabled');
  const stripe = getStripe(config);
  const event = await stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    config.webhookSecret
  );
  assertStripeModeAllowed(event.livemode);

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
        config,
        stripeId((await stripe.prices.retrieve(config.priceId)).product)
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

  const paymentIntentId =
    checkout?.stripePaymentIntentId ??
    paymentIntentIdFromReconciliationEvent(event);
  const isReconciliationEvent =
    Boolean(checkout) || isStripePaymentReconciliationEvent(event.type);
  const transition: StripeWebhookTransition =
    isReconciliationEvent && paymentIntentId
      ? {
          kind: 'RECONCILE',
          paymentIntentId,
          checkout,
        }
      : { kind: 'IGNORE' };

  return applyStripeWebhookTransition(
    {
      eventId: event.id,
      eventType: event.type,
      transition,
    },
    defaultWebhookTransitionDependencies((id) =>
      retrieveStripePaymentSnapshot(stripe, id)
    )
  );
}

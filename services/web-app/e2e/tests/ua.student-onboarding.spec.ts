import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { generateTOTP } from '../../app/utils/totp.server';
import { E2E_STRIPE_BASE_URL, E2E_UA_PARTNER_CODE } from '../constants';
import {
  createPrismaReconciliationDependencies,
  reconcileUaExistingSubscriptions,
} from '../../scripts/reconcile-ua-existing-subscriptions';

const LICENSE_COHORT = 'ua-2026';
const LICENSE_CUTOFF = new Date('2027-01-01T06:00:00.000Z');
const APP_ORIGIN = 'http://127.0.0.1:5173';
const UA_APP_ORIGIN = 'http://ua.localhost:5173';

async function signIn(
  page: Page,
  email: string,
  password: string,
  expectedPath: RegExp
) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(expectedPath, { timeout: 30_000 });
}

async function deleteTestStudentByEmail(email: string) {
  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { memberships: { select: { id: true } } },
    });
    const membershipIds = user?.memberships.map(({ id }) => id) ?? [];

    await prisma.$transaction([
      prisma.studentLicense.deleteMany({
        where: { membershipId: { in: membershipIds } },
      }),
      prisma.orgMembership.deleteMany({
        where: { id: { in: membershipIds } },
      }),
      prisma.user.deleteMany({ where: { email } }),
      prisma.invitation.deleteMany({
        where: { target: email, type: 'onboard-student' },
      }),
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

async function clearStudentClasses(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.orgMembership.update({
      where: { id: membershipId },
      data: { classesAsStudent: { set: [] } },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function replaceLicense(
  membershipId: string,
  organizationId: string,
  state:
    | { status: 'NONE' }
    | {
        status: 'PENDING' | 'ACTIVE' | 'REFUNDED' | 'DISPUTED' | 'REVOKED';
        validUntil?: Date;
      }
) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.studentLicense.deleteMany({
      where: { membershipId, cohort: LICENSE_COHORT },
    });
    if (state.status !== 'NONE') {
      await prisma.studentLicense.create({
        data: {
          membershipId,
          organizationId,
          cohort: LICENSE_COHORT,
          status: state.status,
          source: 'STRIPE_CHECKOUT',
          validUntil: state.validUntil ?? LICENSE_CUTOFF,
          amountPaid: state.status === 'ACTIVE' ? 5_000 : null,
          currency: state.status === 'ACTIVE' ? 'usd' : null,
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function resetFakeStripe(page: Page) {
  const response = await page.request.post(`${E2E_STRIPE_BASE_URL}/test/reset`);
  expect(response.ok()).toBe(true);
}

async function getFakeStripeSessions(page: Page) {
  const response = await page.request.get(
    `${E2E_STRIPE_BASE_URL}/test/sessions`
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    data: Array<{
      id: string;
      mode: string;
      status: string;
      payment_status: string;
      amount_total: number;
      currency: string;
      metadata: Record<string, string>;
      success_url: string;
      cancel_url: string;
      line_items: { data: Array<{ price: { id: string }; quantity: number }> };
      test_request: {
        customer_email: string;
        client_reference_id: string;
        payment_intent_metadata: Record<string, string>;
        idempotency_key: string;
      };
    }>;
  };
}

test.describe.serial('University of Alabama student onboarding', () => {
  test.describe.configure({ timeout: 60_000 });
  test.use({ baseURL: UA_APP_ORIGIN });

  test('carries partner context through every student auth screen and creates a classless student', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const studentEmail = 'ua.new.student@yawp.test';

    try {
      await deleteTestStudentByEmail(studentEmail);

      await page.goto(
        `/?organizationCode=${encodeURIComponent(E2E_UA_PARTNER_CODE)}`
      );
      await expect(page).toHaveURL(`${UA_APP_ORIGIN}/`);
      await expect(
        page.getByRole('heading', { name: 'Welcome to Yawp' })
      ).toHaveCount(0);

      const uaLogo = page.getByAltText('The University of Alabama');
      const yawpLogo = page.getByAltText('Yawp');
      const createAccount = page.getByRole('link', {
        name: 'Create an Account',
      });

      await expect(uaLogo).toBeVisible();
      await expect(yawpLogo).toBeVisible();
      await expect(createAccount).toBeVisible();
      await expect(page.getByRole('link', { name: 'Log In' })).toBeVisible();

      const [uaBox, yawpBox, createAccountBox] = await Promise.all([
        uaLogo.boundingBox(),
        yawpLogo.boundingBox(),
        createAccount.boundingBox(),
      ]);
      expect(uaBox).not.toBeNull();
      expect(yawpBox).not.toBeNull();
      expect(createAccountBox).not.toBeNull();
      expect(uaBox!.width).toBeGreaterThan(240);
      expect(yawpBox!.width).toBeGreaterThan(160);
      expect(uaBox!.y).toBeLessThan(yawpBox!.y);
      expect(yawpBox!.y).toBeLessThan(createAccountBox!.y);

      await createAccount.click();
      await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Access code')).toHaveCount(0);
      await expect(page.getByText('University of Alabama')).toHaveCount(0);
      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );
      await expect(page.getByAltText('Yawp')).toBeVisible();

      await page.getByLabel('Email').fill(studentEmail);
      await page.getByRole('button', { name: 'Submit' }).click();
      await page.waitForURL(/\/auth\/inv\/verify/);

      const invitation = await expect
        .poll(
          () =>
            prisma.invitation.findUnique({
              where: {
                target_type: {
                  target: studentEmail,
                  type: 'onboard-student',
                },
              },
            }),
          { timeout: 5_000 }
        )
        .not.toBeNull()
        .then(() =>
          prisma.invitation.findUniqueOrThrow({
            where: {
              target_type: {
                target: studentEmail,
                type: 'onboard-student',
              },
            },
          })
        );

      expect(JSON.parse(invitation.metadata ?? '{}')).toEqual({
        partner: 'ua',
        organizationId: e2eContext.ua.organizationId,
      });
      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );
      await expect(page.getByAltText('Yawp')).toBeVisible();

      const { otp } = await generateTOTP({
        secret: invitation.secret,
        algorithm: invitation.algorithm as any,
        period: invitation.period,
        charSet: invitation.charSet,
        digits: invitation.digits,
      });
      await page.getByLabel('Code').fill(otp);
      await page.getByRole('button', { name: 'Submit' }).click();
      await page.waitForURL(/\/auth\/inv\/onboard-student/);

      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );
      await expect(page.getByAltText('Yawp')).toBeVisible();
      await expect(page.getByLabel('Class')).toHaveCount(0);
      await page.getByLabel('Name').fill('UA New Student');
      await page
        .getByLabel('Password', { exact: true })
        .fill('strong-password-123');
      await page.getByLabel('Confirm Password').fill('strong-password-123');
      await page.getByRole('button', { name: 'Create account' }).click();

      await page.waitForURL(/\/billing\/ua$/);
      await expect(
        page.getByRole('heading', { name: 'Complete payment' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continue to payment' })
      ).toBeVisible();
      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );

      const user = await prisma.user.findUniqueOrThrow({
        where: { email: studentEmail },
        include: {
          memberships: {
            include: {
              classesAsStudent: true,
            },
          },
        },
      });
      expect(user.memberships).toHaveLength(1);
      expect(user.memberships[0]!.organizationId).toBe(
        e2eContext.ua.organizationId
      );
      expect(user.memberships[0]!.role).toBe('STUDENT');
      expect(user.memberships[0]!.classesAsStudent).toHaveLength(0);

      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/\/auth\/login/);
      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );
      await expect(page.getByAltText('Yawp')).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('remembers the accepted code and requests it only when absent', async ({
    page,
  }) => {
    await page.goto(
      `/auth/inv/signup?organizationCode=${encodeURIComponent(E2E_UA_PARTNER_CODE)}`
    );
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);
    await expect(page.getByText('University of Alabama')).toHaveCount(0);
    await expect(page.getByLabel('Access code')).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel('Access code')).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto(`${UA_APP_ORIGIN}/auth/inv/signup`);
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);
    await expect(page.getByLabel('Access code')).toBeVisible();

    await page.getByLabel('Email').fill('ua.invalid.code@yawp.test');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Access code is required')).toBeVisible();
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);
    await page.getByLabel('Access code').fill('wrong-code');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(
      page.getByText('Enter a valid organization code.')
    ).toBeVisible();
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);

    await page.goto(`${APP_ORIGIN}/auth/inv/signup`);
    await expect(page.getByLabel('Access code')).toBeVisible();
    await expect(page.getByAltText('The University of Alabama')).toHaveCount(0);
  });

  test('redirects the legacy yawp.school UA entry to the canonical UA host before authentication', async ({
    page,
  }) => {
    await page.goto(
      `${APP_ORIGIN}/ua?organizationCode=${encodeURIComponent(E2E_UA_PARTNER_CODE)}`
    );
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/`);
    await expect(page.getByAltText('The University of Alabama')).toBeVisible();
    await expect(page.getByLabel('Code')).toHaveCount(0);
  });

  test('guides a regular Yawp member away from the UA sign-in', async ({
    page,
    e2eContext,
  }) => {
    await page.goto(`${UA_APP_ORIGIN}/auth/login`);
    await page.getByLabel('Email').fill(e2eContext.userEmail);
    await page.getByLabel('Password').fill('johndoe');
    await page.getByRole('button', { name: 'Log in' }).click();

    const callout = page.getByRole('alert');
    await expect(callout).toContainText('This account signs in at yawp.school');
    await expect(
      callout.getByRole('link', { name: 'Continue to yawp.school' })
    ).toHaveAttribute('href', 'https://yawp.school/auth/login');
    await expect(page.getByLabel('Email')).toHaveValue(e2eContext.userEmail);
    await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/login`);
  });

  test('guides a UA-only member to the UA sign-in from yawp.school', async ({
    page,
    e2eContext,
  }) => {
    await page.goto(`${APP_ORIGIN}/auth/login`);
    await page.getByLabel('Email').fill(e2eContext.ua.paidClassless.email);
    await page
      .getByLabel('Password')
      .fill(e2eContext.ua.paidClassless.password);
    await page.getByRole('button', { name: 'Log in' }).click();

    const callout = page.getByRole('alert');
    await expect(callout).toContainText(
      'This account signs in at ua.yawp.school'
    );
    await expect(
      callout.getByRole('link', { name: 'Continue to ua.yawp.school' })
    ).toHaveAttribute('href', 'https://ua.yawp.school/auth/login');
    await expect(page.getByLabel('Email')).toHaveValue(
      e2eContext.ua.paidClassless.email
    );
    await expect(page).toHaveURL(`${APP_ORIGIN}/auth/login`);
  });

  test('keeps UA and regular Yawp login sessions separate by hostname', async ({
    page,
    e2eContext,
  }) => {
    await signIn(
      page,
      e2eContext.ua.paidClassless.email,
      e2eContext.ua.paidClassless.password,
      /\/app/
    );

    await page.goto(`${APP_ORIGIN}/auth/login`);
    await expect(page.getByAltText('The University of Alabama')).toHaveCount(0);
    await page.getByLabel('Email').fill(e2eContext.userEmail);
    await page.getByLabel('Password').fill('johndoe');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(new RegExp(`${APP_ORIGIN}/app`));

    const authCookieDomains = (await page.context().cookies())
      .filter((cookie) => cookie.name === 'en_session')
      .map((cookie) => cookie.domain)
      .sort();
    expect(authCookieDomains).toEqual(['127.0.0.1', 'ua.localhost']);

    await page.goto(`${UA_APP_ORIGIN}/app`);
    await expect(page).toHaveURL(/\/app\/?$/);
  });

  test('lets an existing account explicitly add only a UA student membership', async ({
    page,
    e2eContext,
  }) => {
    test.setTimeout(45_000);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.orgMembership.deleteMany({
        where: {
          userId: e2eContext.userId,
          organizationId: e2eContext.ua.organizationId,
        },
      });

      await page.goto(
        `/auth/inv/signup?organizationCode=${encodeURIComponent(E2E_UA_PARTNER_CODE)}`
      );
      await expect(page).toHaveURL(`${UA_APP_ORIGIN}/auth/inv/signup`);
      const existingAccountLink = page.getByRole('link', {
        name: 'Already have an account?',
      });
      await expect(existingAccountLink).toHaveAttribute(
        'href',
        '/auth/login?redirectTo=%2F'
      );
      await existingAccountLink.click();
      await expect(page).toHaveURL(
        `${UA_APP_ORIGIN}/auth/login?redirectTo=%2F`
      );
      await page.waitForLoadState('networkidle');
      await expect(page.getByAltText('The University of Alabama')).toHaveCount(
        0
      );
      await expect(page.getByAltText('Yawp')).toBeVisible();
      await page.getByLabel('Email').fill(e2eContext.userEmail);
      await page.getByLabel('Password').fill('johndoe');
      await page.getByRole('button', { name: 'Log in' }).click();

      await page.waitForURL(`${UA_APP_ORIGIN}/`);
      await expect(
        page.getByRole('button', { name: 'Continue as a student' })
      ).toBeVisible();
      await page.getByRole('button', { name: 'Continue as a student' }).click();
      await page.waitForURL(/\/billing\/ua$/);

      const membership = await prisma.orgMembership.findUniqueOrThrow({
        where: {
          userId_organizationId: {
            userId: e2eContext.userId,
            organizationId: e2eContext.ua.organizationId,
          },
        },
      });
      expect(membership.role).toBe('STUDENT');
      expect(membership.isOrgOwner).toBe(false);
    } finally {
      await prisma.orgMembership.deleteMany({
        where: {
          userId: e2eContext.userId,
          organizationId: e2eContext.ua.organizationId,
        },
      });
      await prisma.$disconnect();
    }
  });

  test('gates unpaid students across nested app routes and keeps cancel/retry/sign-out available', async ({
    page,
    e2eContext,
  }) => {
    const { unpaid } = e2eContext.ua;
    await replaceLicense(unpaid.membershipId, e2eContext.ua.organizationId, {
      status: 'NONE',
    });

    await signIn(page, unpaid.email, unpaid.password, /\/app|\/billing\/ua/);
    await expect(page).toHaveURL(/\/billing\/ua$/);
    await expect(
      page.getByRole('button', { name: 'Continue to payment' })
    ).toBeVisible();

    await page.goto('/app/my-documents');
    await expect(page).toHaveURL(/\/billing\/ua$/);

    await page.goto('/billing/ua?canceled=1');
    await expect(
      page.getByText(
        'Checkout was canceled. Retry only if your payment did not complete.'
      )
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Retry payment' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('renders every durable billing state without offering duplicate payment during a dispute', async ({
    page,
    e2eContext,
  }) => {
    const { unpaid } = e2eContext.ua;
    const states = [
      {
        label: 'pending',
        state: { status: 'PENDING' as const },
        heading: 'Complete payment',
        button: 'Continue to payment',
      },
      {
        label: 'disputed',
        state: { status: 'DISPUTED' as const },
        heading: 'Payment under review',
        button: null,
      },
      {
        label: 'refunded',
        state: { status: 'REFUNDED' as const },
        heading: 'Complete payment',
        button: 'Continue to payment',
      },
      {
        label: 'revoked',
        state: { status: 'REVOKED' as const },
        heading: 'Complete payment',
        button: 'Continue to payment',
      },
      {
        label: 'expired active',
        state: {
          status: 'ACTIVE' as const,
          validUntil: new Date('2026-01-01T00:00:00.000Z'),
        },
        heading: 'Complete payment',
        button: 'Continue to payment',
      },
    ];

    for (const scenario of states) {
      await test.step(scenario.label, async () => {
        await page.context().clearCookies();
        await replaceLicense(
          unpaid.membershipId,
          e2eContext.ua.organizationId,
          scenario.state
        );
        await signIn(
          page,
          unpaid.email,
          unpaid.password,
          /\/app|\/billing\/ua/
        );
        await expect(
          page.getByRole('heading', { name: scenario.heading })
        ).toBeVisible();
        if (scenario.button) {
          await expect(
            page.getByRole('button', { name: scenario.button })
          ).toBeVisible();
        } else {
          await expect(
            page.getByRole('button', { name: /payment/i })
          ).toHaveCount(0);
          await expect(
            page.getByText(/cannot start another payment/i)
          ).toBeVisible();
        }
        await expect(
          page.getByRole('button', { name: 'Sign out' })
        ).toBeVisible();
      });
    }
  });

  test('serializes parallel Checkout starts through PostgreSQL and Stripe idempotency', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { unpaid } = e2eContext.ua;
    try {
      await resetFakeStripe(page);
      await clearStudentClasses(unpaid.membershipId);
      await replaceLicense(unpaid.membershipId, e2eContext.ua.organizationId, {
        status: 'NONE',
      });
      await signIn(page, unpaid.email, unpaid.password, /\/billing\/ua/);

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          page.request.post(`${UA_APP_ORIGIN}/billing/ua`, {
            maxRedirects: 0,
          })
        )
      );
      expect(responses.every((response) => response.status() === 302)).toBe(
        true
      );
      const locations = new Set(
        responses.map((response) => response.headers().location)
      );
      expect(locations.size).toBe(1);

      const created = await getFakeStripeSessions(page);
      expect(created.data).toHaveLength(1);
      expect(created.data[0]!.test_request).toMatchObject({
        customer_email: unpaid.email,
        client_reference_id: unpaid.membershipId,
        payment_intent_metadata: {
          membershipId: unpaid.membershipId,
          organizationId: e2eContext.ua.organizationId,
          cohort: LICENSE_COHORT,
        },
      });
      expect(created.data[0]!.test_request.idempotency_key).toMatch(
        /^ua-2026:.+:0$/
      );

      const stripeRequest = {
        mode: 'payment',
        'line_items[0][price]': 'price_ua_e2e_2026',
        'line_items[0][quantity]': '1',
        customer_email: unpaid.email,
        client_reference_id: unpaid.membershipId,
        'metadata[membershipId]': unpaid.membershipId,
        'metadata[organizationId]': e2eContext.ua.organizationId,
        'metadata[cohort]': LICENSE_COHORT,
        'payment_intent_data[metadata][membershipId]': unpaid.membershipId,
        'payment_intent_data[metadata][organizationId]':
          e2eContext.ua.organizationId,
        'payment_intent_data[metadata][cohort]': LICENSE_COHORT,
        success_url: `${UA_APP_ORIGIN}/billing/ua/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${UA_APP_ORIGIN}/billing/ua?canceled=1`,
      };
      const extraLineItem = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/v1/checkout/sessions`,
        {
          headers: { 'idempotency-key': 'ua-e2e-extra-line-item' },
          form: {
            ...stripeRequest,
            'line_items[1][price]': 'price_unexpected_extra',
            'line_items[1][quantity]': '1',
          },
        }
      );
      expect(extraLineItem.status()).toBe(400);
      expect(await extraLineItem.json()).toMatchObject({
        error: { message: expect.stringContaining('exactly one line item') },
      });

      const changedIdempotentRequest = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/v1/checkout/sessions`,
        {
          headers: {
            'idempotency-key': created.data[0]!.test_request.idempotency_key,
          },
          form: { ...stripeRequest, customer_email: 'changed@yawp.test' },
        }
      );
      expect(changedIdempotentRequest.status()).toBe(400);
      expect(await changedIdempotentRequest.json()).toMatchObject({
        error: { type: 'idempotency_error' },
      });

      const license = await prisma.studentLicense.findUniqueOrThrow({
        where: {
          membershipId_cohort: {
            membershipId: unpaid.membershipId,
            cohort: LICENSE_COHORT,
          },
        },
      });
      expect(license.stripeCheckoutSessionId).toBe(created.data[0]!.id);
      expect(license.checkoutAttempt).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('completes signed-webhook Checkout and reconciles partial refund and dispute states end to end', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { unpaid } = e2eContext.ua;
    try {
      await resetFakeStripe(page);
      await clearStudentClasses(unpaid.membershipId);
      await replaceLicense(unpaid.membershipId, e2eContext.ua.organizationId, {
        status: 'NONE',
      });

      const invalidWebhook = await page.request.post(
        'http://127.0.0.1:5173/api/stripe/webhook',
        {
          headers: {
            'content-type': 'application/json',
            'stripe-signature': 'invalid-signature',
          },
          data: { id: 'evt_tampered', type: 'checkout.session.completed' },
        }
      );
      expect(invalidWebhook.status()).toBe(400);

      await signIn(page, unpaid.email, unpaid.password, /\/billing\/ua/);
      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(new RegExp(`${E2E_STRIPE_BASE_URL}/checkout/`));
      await expect(
        page.getByRole('heading', { name: 'Test Stripe Checkout' })
      ).toBeVisible();
      await expect(page.getByText('One-time $50.00 payment')).toBeVisible();

      const created = await getFakeStripeSessions(page);
      expect(created.data).toHaveLength(1);
      expect(created.data[0]).toMatchObject({
        mode: 'payment',
        status: 'open',
        payment_status: 'unpaid',
        amount_total: 5_000,
        currency: 'usd',
        metadata: {
          membershipId: unpaid.membershipId,
          organizationId: e2eContext.ua.organizationId,
          cohort: LICENSE_COHORT,
        },
        success_url: `${UA_APP_ORIGIN}/billing/ua/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${UA_APP_ORIGIN}/billing/ua?canceled=1`,
      });
      expect(created.data[0]!.line_items.data).toEqual([
        expect.objectContaining({
          quantity: 1,
          price: expect.objectContaining({ id: 'price_ua_e2e_2026' }),
        }),
      ]);
      expect(created.data[0]!.test_request).toMatchObject({
        customer_email: unpaid.email,
        client_reference_id: unpaid.membershipId,
        payment_intent_metadata: {
          membershipId: unpaid.membershipId,
          organizationId: e2eContext.ua.organizationId,
          cohort: LICENSE_COHORT,
        },
      });

      await page.getByRole('button', { name: 'Complete test payment' }).click();
      await page.waitForURL(/\/app\/?$/);
      await expect(page.getByRole('dialog')).toBeVisible();

      const activeLicense = await prisma.studentLicense.findUniqueOrThrow({
        where: {
          membershipId_cohort: {
            membershipId: unpaid.membershipId,
            cohort: LICENSE_COHORT,
          },
        },
      });
      expect(activeLicense).toMatchObject({
        status: 'ACTIVE',
        source: 'STRIPE_CHECKOUT',
        amountPaid: 5_000,
        currency: 'usd',
        stripePriceId: 'price_ua_e2e_2026',
      });
      expect(activeLicense.stripeCheckoutSessionId).toBe(created.data[0]!.id);
      expect(activeLicense.stripePaymentIntentId).toBe(
        `pi_${created.data[0]!.id}`
      );

      const duplicate = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${created.data[0]!.id}/webhook?eventId=evt_duplicate_after_activation&repeat=2`
      );
      expect(duplicate.ok()).toBe(true);
      expect(
        await prisma.stripeWebhookEvent.count({
          where: { id: 'evt_duplicate_after_activation' },
        })
      ).toBe(1);

      const partialRefund = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${created.data[0]!.id}/refund?amount=2500`
      );
      expect(partialRefund.ok()).toBe(true);
      await page.goto('/app');
      await expect(page.getByRole('dialog')).toBeVisible();

      const dispute = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${created.data[0]!.id}/dispute?status=under_review`
      );
      expect(dispute.ok()).toBe(true);
      await page.goto('/app');
      await expect(page).toHaveURL(/\/billing\/ua$/);
      await expect(
        page.getByRole('heading', { name: 'Payment under review' })
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /payment/i })).toHaveCount(
        0
      );

      const won = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${created.data[0]!.id}/dispute?status=won`
      );
      expect(won.ok()).toBe(true);
      await page.goto('/app');
      await expect(page.getByRole('dialog')).toBeVisible();

      const lost = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${created.data[0]!.id}/dispute?status=lost`
      );
      expect(lost.ok()).toBe(true);
      await page.goto('/app');
      await expect(page).toHaveURL(/\/billing\/ua$/);
      await expect(
        page.getByRole('heading', { name: 'Complete payment' })
      ).toBeVisible();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('serializes concurrent webhook refreshes with the real PostgreSQL advisory lock', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { unpaid } = e2eContext.ua;
    try {
      await resetFakeStripe(page);
      await clearStudentClasses(unpaid.membershipId);
      await replaceLicense(unpaid.membershipId, e2eContext.ua.organizationId, {
        status: 'NONE',
      });
      await signIn(page, unpaid.email, unpaid.password, /\/billing\/ua/);
      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(new RegExp(`${E2E_STRIPE_BASE_URL}/checkout/`));
      const created = await getFakeStripeSessions(page);
      const sessionId = created.data[0]!.id;
      await page.getByRole('button', { name: 'Complete test payment' }).click();
      await page.waitForURL(/\/app\/?$/);

      const metricsReset = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/metrics/reset`
      );
      expect(metricsReset.ok()).toBe(true);
      const [refund, dispute] = await Promise.all([
        page.request.post(
          `${E2E_STRIPE_BASE_URL}/test/sessions/${sessionId}/refund?amount=5000&eventId=evt_concurrent_refund`
        ),
        page.request.post(
          `${E2E_STRIPE_BASE_URL}/test/sessions/${sessionId}/dispute?status=under_review&eventId=evt_concurrent_dispute`
        ),
      ]);
      expect(refund.ok()).toBe(true);
      expect(dispute.ok()).toBe(true);

      const metrics = await page.request.get(
        `${E2E_STRIPE_BASE_URL}/test/metrics`
      );
      expect(metrics.ok()).toBe(true);
      expect(await metrics.json()).toMatchObject({
        activePaymentIntentRequests: 0,
        maxConcurrentPaymentIntentRequests: 1,
      });
      expect(
        await prisma.stripeWebhookEvent.count({
          where: {
            id: { in: ['evt_concurrent_refund', 'evt_concurrent_dispute'] },
          },
        })
      ).toBe(2);
      expect(
        await prisma.studentLicense.findUniqueOrThrow({
          where: {
            membershipId_cohort: {
              membershipId: unpaid.membershipId,
              cohort: LICENSE_COHORT,
            },
          },
          select: { status: true },
        })
      ).toEqual({ status: 'REFUNDED' });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('runs the production subscription importer idempotently against PostgreSQL and rejects cross-student reuse', async ({
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const firstEmail = 'ua.import.one@yawp.test';
    const secondEmail = 'ua.import.two@yawp.test';
    const subscriptionId = 'sub_e2e_real_import';
    const userIds = ['ua-e2e-import-one', 'ua-e2e-import-two'];
    const membershipIds = userIds.map((id) => `${id}-membership`);
    const cleanupImportFixtures = async () => {
      await prisma.studentLicense.deleteMany({
        where: { membershipId: { in: membershipIds } },
      });
      await prisma.orgMembership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    };
    try {
      await cleanupImportFixtures();
      for (const [index, email] of [firstEmail, secondEmail].entries()) {
        await prisma.user.create({
          data: {
            id: userIds[index]!,
            email,
            name: `Import ${index + 1}`,
            memberships: {
              create: {
                id: `${userIds[index]}-membership`,
                organizationId: e2eContext.ua.organizationId,
                role: 'STUDENT',
              },
            },
          },
        });
      }

      const databaseDependencies =
        createPrismaReconciliationDependencies(prisma);
      const dependencies = {
        ...databaseDependencies,
        async retrieveSubscription(id: string) {
          return {
            id,
            status: 'active',
            customer: 'cus_e2e_import',
            items: [{ priceId: 'price_ua_e2e_legacy', currency: 'usd' }],
          };
        },
      };
      const config = {
        organizationId: e2eContext.ua.organizationId,
        allowedPriceIds: new Set(['price_ua_e2e_legacy']),
        cohort: LICENSE_COHORT,
        validUntil: LICENSE_CUTOFF,
      };
      const options = {
        input: [{ email: firstEmail, subscriptionId }],
        config,
        dependencies,
        apply: true,
        now: new Date('2026-08-30T12:00:00.000Z'),
      };

      await expect(reconcileUaExistingSubscriptions(options)).resolves.toEqual([
        expect.objectContaining({ result: 'APPLIED', subscriptionId }),
      ]);
      await expect(reconcileUaExistingSubscriptions(options)).resolves.toEqual([
        expect.objectContaining({
          result: 'APPLIED',
          subscriptionId,
          existingLicense: 'EXISTING_SUBSCRIPTION',
        }),
      ]);
      expect(
        await prisma.studentLicense.count({
          where: { stripeSubscriptionId: subscriptionId },
        })
      ).toBe(1);

      await expect(
        reconcileUaExistingSubscriptions({
          ...options,
          input: [{ email: secondEmail, subscriptionId }],
        })
      ).rejects.toThrow('already attached to another student license');
      expect(
        await prisma.studentLicense.count({
          where: { membershipId: `${userIds[1]}-membership` },
        })
      ).toBe(0);
    } finally {
      await cleanupImportFixtures();
      await prisma.$disconnect();
    }
  });

  test('reuses canceled Checkout, waits for a delayed webhook, deduplicates a full refund, and starts a clean retry', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { unpaid } = e2eContext.ua;
    try {
      await resetFakeStripe(page);
      await clearStudentClasses(unpaid.membershipId);
      await replaceLicense(unpaid.membershipId, e2eContext.ua.organizationId, {
        status: 'NONE',
      });

      await signIn(page, unpaid.email, unpaid.password, /\/billing\/ua/);
      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(new RegExp(`${E2E_STRIPE_BASE_URL}/checkout/`));
      const firstSession = (await getFakeStripeSessions(page)).data[0]!;

      await page.getByRole('link', { name: 'Cancel payment' }).click();
      await page.waitForURL(/\/billing\/ua\?canceled=1$/);
      await expect(
        page.getByRole('button', { name: 'Retry payment' })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Retry payment' }).click();
      await page.waitForURL(
        `${E2E_STRIPE_BASE_URL}/checkout/${firstSession.id}`
      );
      expect((await getFakeStripeSessions(page)).data).toHaveLength(1);

      await page
        .getByRole('button', { name: 'Complete payment without webhook' })
        .click();
      await page.waitForURL(/\/billing\/ua$/);
      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(/\/billing\/ua\?processing=1$/);
      await expect(
        page.getByText(/Stripe is confirming your payment/i)
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /payment/i })).toHaveCount(
        0
      );

      const delayed = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${firstSession.id}/webhook?eventId=evt_delayed_checkout`
      );
      expect(delayed.ok()).toBe(true);
      await page.goto('/app');
      await expect(page.getByRole('dialog')).toBeVisible();

      const fullRefund = await page.request.post(
        `${E2E_STRIPE_BASE_URL}/test/sessions/${firstSession.id}/refund?amount=5000&eventId=evt_full_refund&repeat=2`
      );
      expect(fullRefund.ok()).toBe(true);
      expect(
        await prisma.stripeWebhookEvent.count({
          where: { id: 'evt_full_refund' },
        })
      ).toBe(1);
      await page.goto('/app');
      await expect(page).toHaveURL(/\/billing\/ua$/);

      await page.getByRole('button', { name: 'Continue to payment' }).click();
      await page.waitForURL(new RegExp(`${E2E_STRIPE_BASE_URL}/checkout/`));
      const sessions = (await getFakeStripeSessions(page)).data;
      expect(sessions).toHaveLength(2);
      expect(sessions[1]!.id).not.toBe(firstSession.id);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('recognizes an imported existing subscription and shows the non-dismissible class-code gate', async ({
    page,
    e2eContext,
  }) => {
    const { paidClassless } = e2eContext.ua;
    await clearStudentClasses(paidClassless.membershipId);

    await signIn(
      page,
      paidClassless.email,
      paidClassless.password,
      /\/app|\/billing\/ua/
    );
    await expect(page).toHaveURL(/\/app\/?$/);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Enter your class code' })
    ).toBeVisible();
    const dashboard = page.getByTestId('app._index');
    await expect(dashboard).toHaveClass(/pointer-events-none/);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      dialog.getByRole('button', { name: 'Sign out' })
    ).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);

    await dialog.getByLabel('Class code').fill('WRONG');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Invalid code.');

    await page.goto('/app/my-documents');
    await expect(page).toHaveURL(/\/app\/?$/);
    await expect(page.getByRole('dialog')).toBeVisible();

    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sign out' })
      .click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('enrolls a paid student in place using a tenant-scoped single class code', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { paidClassless } = e2eContext.ua;
    try {
      await clearStudentClasses(paidClassless.membershipId);
      await signIn(page, paidClassless.email, paidClassless.password, /\/app/);

      const dialog = page.getByRole('dialog');
      await dialog
        .getByLabel('Class code')
        .fill(e2eContext.ua.singleClassCode.toLowerCase());
      await dialog.getByRole('button', { name: 'Continue' }).click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByTestId('app._index')).not.toHaveClass(
        /pointer-events-none/
      );
      const enrolled = await prisma.orgMembership.findUniqueOrThrow({
        where: { id: paidClassless.membershipId },
        select: {
          classesAsStudent: {
            select: { id: true, school: { select: { organizationId: true } } },
          },
        },
      });
      expect(enrolled.classesAsStudent.map((klass) => klass.id)).toEqual([
        e2eContext.ua.singleClassId,
      ]);
      expect(enrolled.classesAsStudent[0]!.school.organizationId).toBe(
        e2eContext.ua.organizationId
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  test('keeps ambiguous class selection inside the dashboard dialog', async ({
    page,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const { paidClassless } = e2eContext.ua;
    try {
      await clearStudentClasses(paidClassless.membershipId);
      await signIn(page, paidClassless.email, paidClassless.password, /\/app/);

      let dialog = page.getByRole('dialog');
      await dialog
        .getByLabel('Class code')
        .fill(e2eContext.ua.ambiguousClassCode);
      await dialog.getByRole('button', { name: 'Continue' }).click();

      dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', { name: 'Select your class' })
      ).toBeVisible();
      const classSelect = dialog.getByLabel('Class');
      await expect(classSelect.locator('option')).toHaveCount(3);
      await classSelect.selectOption(e2eContext.ua.ambiguousClassIds[1]!);
      await dialog.getByRole('button', { name: 'Join class' }).click();

      await expect(page.getByRole('dialog')).toHaveCount(0);
      const enrolled = await prisma.orgMembership.findUniqueOrThrow({
        where: { id: paidClassless.membershipId },
        select: { classesAsStudent: { select: { id: true } } },
      });
      expect(enrolled.classesAsStudent.map((klass) => klass.id)).toEqual([
        e2eContext.ua.ambiguousClassIds[1],
      ]);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('keeps teachers and non-UA memberships out of student billing', async ({
    page,
    e2eContext,
  }) => {
    await page.goto('/ua');
    await page.getByRole('link', { name: 'Log in' }).click();
    await page.getByLabel('Email').fill(e2eContext.ua.teacher.email);
    await page.getByLabel('Password').fill(e2eContext.ua.teacher.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/\/app\/?$/);
    await expect(page.getByTestId('app._index')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto(`${APP_ORIGIN}/auth/login`);
    await page.getByLabel('Email').fill(e2eContext.userEmail);
    await page.getByLabel('Password').fill('johndoe');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(new RegExp(`${APP_ORIGIN}/app`));
    await expect(page).toHaveURL(/\/app\/?$/);
    await page.goto(`${APP_ORIGIN}/billing/ua`);
    await expect(page).toHaveURL(/\/app\/?$/);

    await page.context().clearCookies();
    await page.goto(`${APP_ORIGIN}/auth/inv/signup`);
    await expect(page.getByLabel('Access code')).toBeVisible();
    await expect(page.getByAltText('The University of Alabama')).toHaveCount(0);
  });
});
